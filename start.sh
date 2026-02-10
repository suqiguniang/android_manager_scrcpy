#!/bin/sh
echo "Starting ADB server..."
adb kill-server
# Start ADB server in background, listening on all interfaces (-a) and specific port
# using 'nodaemon server' to keep it as a child process we can track
adb -a -P 5037 nodaemon server > /tmp/adb.log 2>&1 &
ADB_PID=$!

echo "Waiting for ADB server to initialize..."
sleep 3

if ps -p $ADB_PID > /dev/null; then
    echo "ADB server is running (PID $ADB_PID)."
else
    echo "ADB server failed to start. Logs:"
    cat /tmp/adb.log
    # Fallback to standard start-server if nodaemon fails (unlikely)
    adb start-server
fi

echo "Checking ADB devices..."
adb devices

echo "Starting application..."
npm run server:start
