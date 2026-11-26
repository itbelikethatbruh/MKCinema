import http.server, ssl, sys, functools
d = sys.argv[1]
h = functools.partial(http.server.SimpleHTTPRequestHandler, directory=d)
s = http.server.ThreadingHTTPServer(('127.0.0.1', 8443), h)
c = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER); c.load_cert_chain(sys.argv[2], sys.argv[3])
s.socket = c.wrap_socket(s.socket, server_side=True)
s.serve_forever()
