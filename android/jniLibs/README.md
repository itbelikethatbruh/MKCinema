# Torrent engine binaries

`lib<abi>/libmkp2p.so` are not libraries: they are the MKCinema torrent engine (`windows/cmd/mkp2p`), named .so so
Android installs them into the app's native library folder, the one place an app may run a program from.
Rebuild from the `windows/` folder (Go 1.24+):

    GOOS=android GOARCH=arm64 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w -checklinkname=0" -o ../android/jniLibs/arm64-v8a/libmkp2p.so ./cmd/mkp2p
    GOOS=linux GOARCH=arm GOARM=7 CGO_ENABLED=0 go build -trimpath -ldflags "-s -w" -o ../android/jniLibs/armeabi-v7a/libmkp2p.so ./cmd/mkp2p

The 32-bit build is a static Linux program (Go can't link 32-bit Android programs without the NDK); it runs on
the 32-bit Fire TV Sticks.
