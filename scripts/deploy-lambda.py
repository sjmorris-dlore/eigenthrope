#!/usr/bin/env python3
"""
deploy-lambda.py
Packages and deploys the Eigenthrope Lambda functions to AWS.

  eigenthrope-mint-nfts     - Step 1: mint NFTs to vault wallet
  eigenthrope-create-offers - Step 2: create sell offers to winners

Usage:
    python scripts/deploy-lambda.py               # deploy both functions
    python scripts/deploy-lambda.py --mint-only   # deploy only mint-nfts
    python scripts/deploy-lambda.py --offers-only # deploy only create-offers

Requirements:
    pip install boto3
    AWS credentials in environment (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
    Node modules already installed: cd lambda && npm install
    Nested ESM copy already removed:
        rm -rf lambda/node_modules/@xrplf/isomorphic/node_modules/@noble/hashes
    (This script checks and removes it automatically.)
"""

import boto3
import json
import os
import sys
import io
import zipfile
import hashlib
import shutil
import time

REGION            = "us-east-1"
SCRIPT_DIR        = os.path.dirname(os.path.abspath(__file__))
PROJECT_DIR       = os.path.dirname(SCRIPT_DIR)
LAMBDA_DIR        = os.path.join(PROJECT_DIR, "lambda")
NODE_MODULES_DIR  = os.path.join(LAMBDA_DIR, "node_modules")
RUNTIME           = "nodejs22.x"
VAULT_SECRET_NAME = "eigenthrope/vault"

# This nested copy is ESM-only and breaks xrpl's CJS require() chain.
NESTED_HASHES_DIR = os.path.join(
    NODE_MODULES_DIR, "@xrplf", "isomorphic", "node_modules", "@noble", "hashes"
)

FUNCTIONS = {
    "mint-nfts": {
        "name":        "eigenthrope-mint-nfts",
        "handler":     "index.handler",
        "description": "Step 1: Scan XRPL for voters, mint NFTs to vault wallet",
        "timeout":     300,
        "memory":      256,
        "source":      os.path.join(LAMBDA_DIR, "mint-nfts", "index.mjs"),
    },
    "create-offers": {
        "name":        "eigenthrope-create-offers",
        "handler":     "index.handler",
        "description": "Step 2: Create sell offers from vault wallet to winners",
        "timeout":     300,
        "memory":      256,
        "source":      os.path.join(LAMBDA_DIR, "create-offers", "index.mjs"),
    },
}


# ---------------------------------------------------------------------------
# Dependency hygiene
# ---------------------------------------------------------------------------

def ensure_no_nested_hashes():
    if os.path.isdir(NESTED_HASHES_DIR):
        shutil.rmtree(NESTED_HASHES_DIR)
        print(f"  Removed nested @noble/hashes (ESM-only, breaks xrpl)")
    else:
        print(f"  @noble/hashes clean")


# ---------------------------------------------------------------------------
# ZIP builder
# ---------------------------------------------------------------------------

def _zf_add(zf: zipfile.ZipFile, src_path: str, arc_name: str):
    """Add a file with a fixed timestamp so the zip hash is content-deterministic."""
    info = zipfile.ZipInfo(arc_name, date_time=(2020, 1, 1, 0, 0, 0))
    info.compress_type = zipfile.ZIP_DEFLATED
    with open(src_path, "rb") as f:
        zf.writestr(info, f.read())


def create_function_zip(fn_key: str) -> bytes:
    cfg = FUNCTIONS[fn_key]
    source_path = cfg["source"]

    if not os.path.exists(source_path):
        print(f"ERROR: source not found: {source_path}")
        sys.exit(1)
    if not os.path.isdir(NODE_MODULES_DIR):
        print(f"ERROR: {NODE_MODULES_DIR} not found.")
        print("Run: cd lambda && npm install")
        sys.exit(1)

    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", zipfile.ZIP_DEFLATED) as zf:
        # Handler must be index.mjs at the zip root (handler = "index.handler")
        _zf_add(zf, source_path, "index.mjs")

        # Walk all of node_modules — arc paths are relative to LAMBDA_DIR
        # so they land at node_modules/... inside the zip.
        for root, dirs, files in os.walk(NODE_MODULES_DIR):
            dirs[:] = sorted(dirs)
            for file_name in sorted(files):
                full_path = os.path.join(root, file_name)
                arc_name = os.path.relpath(full_path, LAMBDA_DIR).replace("\\", "/")
                info = zipfile.ZipInfo(arc_name, date_time=(2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                with open(full_path, "rb") as f:
                    zf.writestr(info, f.read())

    size_mb = buffer.tell() / 1024 / 1024
    print(f"  ZIP: {size_mb:.1f} MB (limit: 50 MB direct, 250 MB unzipped)")
    if size_mb > 50:
        print("  WARNING: zip exceeds 50 MB — Lambda direct upload will fail.")
        print("  Upload via S3: aws s3 cp mint-nfts-bundled.zip s3://your-bucket/")
        print("  Then: aws lambda update-function-code --function-name ... --s3-bucket ... --s3-key ...")
    buffer.seek(0)
    return buffer.read()


# ---------------------------------------------------------------------------
# IAM
# ---------------------------------------------------------------------------

def _policy_eq(desired: dict, current_encoded: str) -> bool:
    import urllib.parse
    try:
        current = json.loads(urllib.parse.unquote(current_encoded))
        return json.dumps(desired, sort_keys=True) == json.dumps(current, sort_keys=True)
    except Exception:
        return False


def get_or_create_role(iam_client, account_id: str) -> str:
    role_name = "eigenthrope-lambda-role"
    trust_policy = {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect": "Allow",
            "Principal": {"Service": "lambda.amazonaws.com"},
            "Action": "sts:AssumeRole",
        }],
    }
    inline_policy = {
        "Version": "2012-10-17",
        "Statement": [
            {
                "Effect": "Allow",
                "Action": [
                    "logs:CreateLogGroup",
                    "logs:CreateLogStream",
                    "logs:PutLogEvents",
                ],
                "Resource": "arn:aws:logs:*:*:*",
            },
            {
                "Effect": "Allow",
                "Action": ["secretsmanager:GetSecretValue"],
                "Resource": f"arn:aws:secretsmanager:{REGION}:{account_id}:secret:eigenthrope/*",
            },
            {
                "Effect": "Allow",
                "Action": [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                ],
                "Resource": [
                    f"arn:aws:dynamodb:{REGION}:{account_id}:table/eigenthrope_minting",
                    f"arn:aws:dynamodb:{REGION}:{account_id}:table/eigenthrope_minting/index/*",
                    f"arn:aws:dynamodb:{REGION}:{account_id}:table/eigenthrope_artifacts",
                    f"arn:aws:dynamodb:{REGION}:{account_id}:table/eigenthrope_artifacts/index/*",
                    # create-offers writes bot_claim_signal here after minting,
                    # so the observer bots can claim new offers immediately
                    # instead of waiting on their periodic safety-net sweep.
                    f"arn:aws:dynamodb:{REGION}:{account_id}:table/eigenthrope_config",
                ],
            },
        ],
    }

    try:
        resp = iam_client.get_role(RoleName=role_name)
        role_arn = resp["Role"]["Arn"]

        # Update inline policy idempotently
        try:
            current = iam_client.get_role_policy(RoleName=role_name, PolicyName="eigenthrope-lambda-policy")
            if _policy_eq(inline_policy, current["PolicyDocument"]):
                print(f"  IAM role + policy unchanged: {role_name}")
                return role_arn
        except iam_client.exceptions.NoSuchEntityException:
            pass

        iam_client.put_role_policy(
            RoleName=role_name,
            PolicyName="eigenthrope-lambda-policy",
            PolicyDocument=json.dumps(inline_policy),
        )
        print(f"  Updated IAM policy: {role_name}")
        return role_arn

    except iam_client.exceptions.NoSuchEntityException:
        resp = iam_client.create_role(
            RoleName=role_name,
            AssumeRolePolicyDocument=json.dumps(trust_policy),
            Description="Execution role for Eigenthrope Lambda functions",
        )
        role_arn = resp["Role"]["Arn"]
        iam_client.put_role_policy(
            RoleName=role_name,
            PolicyName="eigenthrope-lambda-policy",
            PolicyDocument=json.dumps(inline_policy),
        )
        print(f"  Created IAM role: {role_name}")
        print("  Waiting 10 s for IAM propagation...")
        time.sleep(10)
        return role_arn


# ---------------------------------------------------------------------------
# Lambda deploy
# ---------------------------------------------------------------------------

def _config_changed(current_cfg: dict, fn_cfg: dict, env_vars: dict) -> bool:
    if current_cfg.get("Handler") != fn_cfg["handler"]:
        return True
    if current_cfg.get("Description") != fn_cfg["description"]:
        return True
    if current_cfg.get("Timeout") != fn_cfg["timeout"]:
        return True
    if current_cfg.get("MemorySize") != fn_cfg["memory"]:
        return True
    current_env = (current_cfg.get("Environment") or {}).get("Variables", {})
    return current_env != env_vars


def deploy_function(lambda_client, fn_key: str, zip_bytes: bytes, role_arn: str):
    cfg = FUNCTIONS[fn_key]
    name = cfg["name"]
    env_vars = {"VAULT_SECRET_NAME": VAULT_SECRET_NAME}

    try:
        current = lambda_client.get_function(FunctionName=name)["Configuration"]
        waiter = lambda_client.get_waiter("function_updated")

        lambda_client.update_function_code(FunctionName=name, ZipFile=zip_bytes)
        waiter.wait(FunctionName=name)
        print(f"  Updated code: {name}")

        if _config_changed(current, cfg, env_vars):
            lambda_client.update_function_configuration(
                FunctionName=name,
                Handler=cfg["handler"],
                Description=cfg["description"],
                Timeout=cfg["timeout"],
                MemorySize=cfg["memory"],
                Environment={"Variables": env_vars},
            )
            waiter.wait(FunctionName=name)
            print(f"  Updated config: {name}")

    except lambda_client.exceptions.ResourceNotFoundException:
        lambda_client.create_function(
            FunctionName=name,
            Runtime=RUNTIME,
            Role=role_arn,
            Handler=cfg["handler"],
            Code={"ZipFile": zip_bytes},
            Description=cfg["description"],
            Timeout=cfg["timeout"],
            MemorySize=cfg["memory"],
            Environment={"Variables": env_vars},
        )
        print(f"  Created: {name}")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    args = sys.argv[1:]
    if "--mint-only" in args:
        to_deploy = ["mint-nfts"]
    elif "--offers-only" in args:
        to_deploy = ["create-offers"]
    else:
        to_deploy = list(FUNCTIONS.keys())

    print("\nEigenthrope Lambda Deploy")
    print("=" * 40)

    print("\nChecking node_modules...")
    if not os.path.isdir(NODE_MODULES_DIR):
        print(f"ERROR: {NODE_MODULES_DIR} not found.")
        print("Run: cd lambda && npm install")
        print("Then remove nested ESM copy (this script does it automatically next time).")
        sys.exit(1)
    ensure_no_nested_hashes()

    session = boto3.Session(region_name=REGION)
    lambda_client = session.client("lambda")
    iam_client    = session.client("iam")
    sts_client    = session.client("sts")

    account_id = sts_client.get_caller_identity()["Account"]
    print(f"\nAWS account: {account_id}")

    print("\nEnsuring IAM role...")
    role_arn = get_or_create_role(iam_client, account_id)
    print(f"  ARN: {role_arn}")

    for fn_key in to_deploy:
        cfg = FUNCTIONS[fn_key]
        print(f"\nDeploying {cfg['name']}...")
        zip_bytes = create_function_zip(fn_key)
        deploy_function(lambda_client, fn_key, zip_bytes, role_arn)

    print("\n" + "=" * 40)
    print("Done.\n")
    for fn_key in to_deploy:
        cfg = FUNCTIONS[fn_key]
        print(f"  {cfg['name']}")
        print(f"    handler: {cfg['handler']}  timeout: {cfg['timeout']}s  runtime: {RUNTIME}")
        print(f"    env: VAULT_SECRET_NAME={VAULT_SECRET_NAME}")
    print()


if __name__ == "__main__":
    main()
