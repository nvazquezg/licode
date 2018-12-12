#!/bin/bash

# Sample script for the exec plugin (collectd-exec(5))
#
# This script uses smartctl(8) to read HDD temperatures. The drives are
# attached to a 3ware RAID controller which hddtempd can't handle.
# Unfortunately the smartmontools don't have a library so we can't write a
# C-plugin, at least not easily.
# Please note that only root can read the SMART attributes from harddrives,
# because special ``capabilities'' are necessary. However, the exec plugin will
# refuse to run scripts as root, which is why `sudo' is used here for
# fine-grained root privileges for the user `smart'. This isn't as straigt
# forward as one might hope, but we think that the gained security is worth it.

# The sudo configuration looks something like this:
# -- 8< --
# Cmnd_Alias      SMARTCTL = /usr/sbin/smartctl -d 3ware\,0 -A /dev/twe0, /usr/sbin/smartctl -d 3ware\,1 -A /dev/twe0, /usr/sbin/smartctl -d ata -A /dev/sda
# smart   ALL = (root) NOPASSWD: SMARTCTL
# -- >8 --

HOSTNAME="${COLLECTD_HOSTNAME:-`hostname -f`}"
INTERVAL="${COLLECTD_INTERVAL:-60}"
INTERVAL=10
while sleep "$INTERVAL"
do
        # UDP=$((  sudo lsof -n -P -i udp|grep node | wc -l)  2> /dev/null ) ;
        UDP=$((  sudo netstat -anp|grep udp|grep node | wc -l)  2> /dev/null ) ;
        if [ $? -ne 0 ]
        then
                UDP="U"
        fi
        echo "PUTVAL $HOSTNAME/exec-licode/gauge-UDP_TOTAL interval=$INTERVAL N:$UDP" | tee -a /tmp/licodeMon.log

        #RECORDINGS=$((sudo lsof -n -P -i tcp|grep node|grep -v '127.0.0'|grep 'ESTABLISHED' |grep '193.146.230' |wc -l ) 2> /dev/null);
        RECORDINGS=$((sudo netstat -anp|grep 'ESTABLISHED'| grep 'recorder.js' |wc -l ) 2> /dev/null);
        if [ $? -ne 0 ]
        then
                RECORDINGS="U"
        fi
        echo "PUTVAL $HOSTNAME/exec-licode/gauge-RECORDINGS interval=$INTERVAL N:$RECORDINGS" | tee -a /tmp/licodeMon.log

        #WEBSOCKET=$((sudo lsof -n -P -i tcp|grep node|grep -v '127.0.0'|grep 'ESTABLISHED' |grep 8080|wc -l ) 2> /dev/null ) ;
        WEBSOCKET=$((sudo netstat -anp|grep 'ESTABLISHED'|grep ':8080' |wc -l ) 2> /dev/null ) ;
        if [ $? -ne 0 ]
        then
                WEBSOCKET="U"
        fi

        # Solo de usuarios, no cuenta la que hace el recorder
        WEBSOCKET=$(expr $WEBSOCKET - $RECORDINGS)
        echo "PUTVAL $HOSTNAME/exec-licode/gauge-WEBSOCKET_USED interval=$INTERVAL N:$WEBSOCKET" | tee -a /tmp/licodeMon.log

        PUBLISHERS=$((/bin/bash /opt/portsUDP.sh|grep publisher|wc -l )  2> /dev/null ) ;
#$UDP
        #echo "PUTVAL $HOSTNAME/exec-licode/gauge-PUBLISHER interval=$INTERVAL N:$PUBLISHERS" | tee -a /tmp/licodeMon.log

        SUBSCRIBERS=$((/bin/bash /opt/portsUDP.sh|grep subscriber|wc -l ) 2> /dev/null ) ;
        #echo "PUTVAL $HOSTNAME/exec-licode/gauge-SUBSCRIBERS interval=$INTERVAL N:$SUBSCRIBERS" | tee -a /tmp/licodeMon.log

        UDP_FAILED=$(expr $UDP - $PUBLISHERS - $SUBSCRIBERS)
        echo "PUTVAL $HOSTNAME/exec-licode/gauge-UDP_FAILED interval=$INTERVAL N:$UDP_FAILED" | tee -a /tmp/licodeMon.log

        UDP_USED=$(expr $UDP - $UDP_FAILED)
        echo "PUTVAL $HOSTNAME/exec-licode/gauge-UDP_USED interval=$INTERVAL N:$UDP_USED" | tee -a /tmp/licodeMon.log

done
