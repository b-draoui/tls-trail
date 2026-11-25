# API contract

The frontend (`public/`) is served under `/lab/` and calls two routes with relative URLs. Your backend must answer them with JSON shaped like this. If a field is missing, the page tells you which one.

## GET /lab/api/whoami

Describes what this backend received.

```json
{
  "port": 3000,
  "protocol": "http",
  "httpVersion": "1.0",
  "remoteAddress": "127.0.0.1",
  "headers": {
    "host": "monsite.local",
    "x-real-ip": "192.168.56.20",
    "x-forwarded-for": "192.168.56.20",
    "connection": "close",
    "user-agent": "Mozilla/5.0 ..."
  }
}
```

| Field | Type | Meaning |
|---|---|---|
| `port` | number | Port this backend listens on (3000 or 3001) |
| `protocol` | string | Protocol of the request this backend received |
| `httpVersion` | string | HTTP version of that request |
| `remoteAddress` | string | IP of whoever opened the TCP connection to this backend |
| `headers` | object | A few request headers, lowercase names. Only the ones that exist |

## GET /lab/api/trace?mode=encrypt|decrypt&msg=...

Everything from `/whoami`, plus the AES operation.

```json
{
  "port": 3001,
  "protocol": "http",
  "httpVersion": "1.0",
  "remoteAddress": "127.0.0.1",
  "headers": { "host": "monsite.local", "x-forwarded-for": "192.168.56.20" },
  "mode": "encrypt",
  "msg": "Hello",
  "status": 200,
  "result": "<base64 ciphertext>",
  "requestLine": "GET /lab/api/trace?mode=encrypt&msg=Hello HTTP/1.0"
}
```

| Field | Type | Meaning |
|---|---|---|
| `mode` | string | `encrypt` or `decrypt` |
| `msg` | string | The message as the backend received it |
| `status` | number | What `/encrypt` or `/decrypt` would have returned: 200, 400 or 500 |
| `result` | string | The ciphertext, the plaintext, or the error text |
| `requestLine` | string | The request line as the backend saw it |

The route itself always answers with HTTP 200, even when `status` is 400: the error goes inside the JSON so the page can show it.

The values in the examples are illustrations; yours come from your own requests.

## Static files

`GET /lab/` must serve `public/index.html`, and `/lab/style.css` and `/lab/app.js` must work too.
