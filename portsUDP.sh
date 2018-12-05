# sudo cat /proc/net/nf_conntrack|grep udp|grep -v UNREPLIED|sort |grep dport=64|awk -F ' ' '{print $9}'|cut -d '=' -f 2| if [$_ -le 64020]; then echo "1" fi;

sudo cat /proc/net/nf_conntrack|grep udp|grep -v UNREPLIED|sort |grep dport=|sed 's/dport=//g' |awk -F ' ' -v MIN_PORT="$MIN_PORT" -v MAX_PORT="$MAX_PORT"  '{ if ($9>=MIN_PORT && $9 <=MAX_PORT) print "publisher: " $9 " TTL:" $5}' |grep 'TTL:179'
sudo cat /proc/net/nf_conntrack|grep udp|grep -v UNREPLIED|sort |grep dport=|sed 's/dport=//g' |awk -F ' ' -v MIN_PORT="$MIN_PORT" -v MAX_PORT="$MAX_PORT"  '{ if ($13>=MIN_PORT && $13 <=MAX_PORT) print "subscriber: " $13 " TTL:" $5}'|grep 'TTL:179'
