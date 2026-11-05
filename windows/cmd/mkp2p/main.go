// mkp2p is the torrent engine as a small program, for the Android and TV app. The app starts it with the cache
// folder, reads the local address from the first line it prints, and stops it by closing its input (which also
// happens if the app is killed). Everything it downloaded is deleted when it stops.
package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"mkcinema/p2p"
)

func main() {
	dir := flag.String("dir", "", "cache folder (its p2p subfolder is wiped)")
	keep := flag.Int("keep", 1, "torrents kept at once")
	reserveMB := flag.Int64("reserve-mb", 600, "stop when free space falls below this")
	conns := flag.Int("conns", 30, "peer connections per torrent")
	flag.Parse()
	if *dir == "" {
		fmt.Println("error: -dir is required")
		os.Exit(2)
	}
	log.SetOutput(os.Stderr)
	// Android has no /etc/resolv.conf, so Go's own resolver would ask 127.0.0.1 and fail: use public DNS instead
	if _, err := os.Stat("/etc/resolv.conf"); err != nil {
		servers := []string{"1.1.1.1:53", "8.8.8.8:53", "9.9.9.9:53"}
		net.DefaultResolver = &net.Resolver{PreferGo: true, Dial: func(ctx context.Context, network, _ string) (net.Conn, error) {
			d := net.Dialer{Timeout: 3 * time.Second}
			var last error
			for _, s := range servers {
				c, err := d.DialContext(ctx, network, s)
				if err == nil {
					return c, nil
				}
				last = err
			}
			return nil, last
		}}
	}
	e, err := p2p.StartOpts(*dir, p2p.Options{Keep: *keep, Reserve: *reserveMB << 20, Conns: *conns})
	if err != nil {
		fmt.Println("error: " + err.Error())
		os.Exit(1)
	}
	fmt.Println(e.Base)
	stop := make(chan struct{}, 2)
	go func() { _, _ = io.Copy(io.Discard, os.Stdin); stop <- struct{}{} }()
	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGTERM, syscall.SIGINT)
	go func() { <-sig; stop <- struct{}{} }()
	<-stop
	e.Close()
}
