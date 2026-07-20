@echo off
REM Clears all messages from the Eigenthrope Discord channels (#current-story
REM and #theories). Requires one-time setup in .env.local — see the comment
REM at the top of scripts\clear-discord-channels.mjs.
node scripts\clear-discord-channels.mjs --yes
pause
