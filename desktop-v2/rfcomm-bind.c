// rfcomm-bind.c - minimal replacement for `rfcomm bind` (removed from BlueZ 5.87+).
// Creates /dev/rfcommN bound to a remote MAC + channel via the kernel RFCOMMCREATEDEV
// ioctl. Build: gcc -O2 -o rfcomm-bind rfcomm-bind.c -lbluetooth
// Usage: sudo ./rfcomm-bind <N> <AA:BB:CC:DD:EE:FF> <channel>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>
#include <sys/socket.h>
#include <sys/ioctl.h>
#include <bluetooth/bluetooth.h>
#include <bluetooth/rfcomm.h>

int main(int argc, char **argv) {
  if (argc != 4) {
    fprintf(stderr, "usage: %s <dev-number> <MAC> <channel>\n", argv[0]);
    return 2;
  }
  int devnum = atoi(argv[1]);
  int channel = atoi(argv[3]);

  struct rfcomm_dev_req req;
  memset(&req, 0, sizeof(req));
  req.dev_id = devnum;
  // A plain "bind" creates a tty that dials the remote channel on open. It must
  // NOT set RFCOMM_REUSE_DLC (that is only valid when reusing an already-
  // connected socket; with no such socket the ioctl returns EBADFD -
  // "File descriptor in bad state"). Flags are left at 0, exactly like the old
  // `rfcomm bind` command did.
  req.flags = 0;
  // local addr = BDADDR_ANY (all zeroes, already memset)
  str2ba(argv[2], &req.dst);   // remote device MAC
  req.channel = channel;

  int ctl = socket(AF_BLUETOOTH, SOCK_RAW, BTPROTO_RFCOMM);
  if (ctl < 0) { perror("socket(AF_BLUETOOTH)"); return 1; }

  int dev = ioctl(ctl, RFCOMMCREATEDEV, &req);
  if (dev < 0) { perror("ioctl(RFCOMMCREATEDEV)"); close(ctl); return 1; }

  printf("bound /dev/rfcomm%d -> %s channel %d\n", dev, argv[2], channel);
  close(ctl);
  return 0;
}
