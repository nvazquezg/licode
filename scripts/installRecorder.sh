#!/usr/bin/env bash

set -e

SCRIPT=`pwd`/$0
FILENAME=`basename $SCRIPT`
PATHNAME=`dirname $SCRIPT`
ROOT=`dirname $SCRIPT`
BUILD_DIR=$ROOT/build
LICODE_ROOT="$ROOT"/..
CURRENT_DIR=`pwd`
NVM_CHECK="$LICODE_ROOT"/scripts/checkNvm.sh
EXTRAS=$LICODE_ROOT/extras

. $NVM_CHECK
nvm use

cd $LICODE_ROOT/erizo_controller/erizoClient/
$LICODE_ROOT/node_modules/.bin/gulp erizofc

cd $EXTRAS/recorder
npm install --loglevel error express body-parser morgan errorhandler socket.io-client
cd $CURRENT_DIR
