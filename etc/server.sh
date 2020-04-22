#!/usr/bin/env bash

this=`readlink -fe "$0"`
this_dir=`dirname "$this"`
cd "$this_dir"

APP_NAME="${this_dir}/server.js"
LOG_FILE="${this_dir}/server.log"

pgrep -f "$APP_NAME" &>/dev/null
RUNNING="$?"
MY_PID=`pgrep -f "$APP_NAME"`
action="$1"

if [ "$action" = "start" ]; then
    if [ "$RUNNING" -eq 1 ]; then
        echo "Starting .."
        nohup node --max-old-space-size=16384 "$APP_NAME" &>"$LOG_FILE" &
    else
        echo "Already running .."
    fi
    exit
fi

if [ "$action" = "stop" ]; then
    if [ "$RUNNING" -eq 1 ]; then
        echo "Already stopped .."
    else
        echo "Killing .."
        kill -15 "$MY_PID"
    fi
    exit
fi

if [ "$action" = "restart" ]; then
    "$this" stop "$worker"
    "$this" start "$worker"
    exit
fi

echo "Usage: `basename ${this}` start|stop|restart"
exit 1
