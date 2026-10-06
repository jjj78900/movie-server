const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ⭐️ 关键修改：优先使用 Render 提供的端口，本地环境默认 3000
const PORT = process.env.PORT || 3000;

const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', '*');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    const parsedUrl = url.parse(req.url, true);

    // ========================================================
    // 1. 视频流代理（FLV 等流媒体，支持 Range 请求，动态 Referer）
    // ========================================================
    if (parsedUrl.pathname === '/api/stream') {
        const targetUrl = parsedUrl.query.url;
        if (!targetUrl) {
            res.writeHead(400);
            res.end('缺少 url 参数');
            return;
        }

        const client = targetUrl.startsWith('https') ? https : http;
        
        let referer = '';
        try {
            const u = new URL(targetUrl);
            referer = u.origin + '/';
        } catch(e) {}

        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': referer,
                'Range': req.headers['range'] || 'bytes=0-'
            }
        };

        const proxyReq = client.get(targetUrl, options, (proxyRes) => {
            const headers = Object.assign({}, proxyRes.headers);
            headers['Access-Control-Allow-Origin'] = '*';
            headers['Access-Control-Expose-Headers'] = 'Content-Length, Content-Range, Accept-Ranges';
            
            res.writeHead(proxyRes.statusCode, headers);
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (e) => {
            console.error('流代理错误:', e.message);
            res.writeHead(500);
            res.end('流代理错误: ' + e.message);
        });
        return;
    }

    // ========================================================
    // 2. 静态文件服务
    // ========================================================
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/index.html') {
        serveFile(res, path.join(__dirname, 'index.html'));
        return;
    }
    
    if (parsedUrl.pathname.endsWith('.html')) {
        const fileName = parsedUrl.pathname.substring(1);
        const filePath = path.join(__dirname, fileName);
        
        if (!filePath.startsWith(__dirname)) {
            res.writeHead(403);
            res.end('Forbidden');
            return;
        }
        
        serveFile(res, filePath);
        return;
    }

    // ========================================================
    // 3. 普通接口和图片代理
    // ========================================================
    if (parsedUrl.pathname === '/api/proxy' || parsedUrl.pathname === '/api/image') {
        const targetUrl = parsedUrl.query.url;
        const referer = parsedUrl.query.referer || '';

        if (!targetUrl) {
            res.writeHead(400);
            res.end('缺少 url 参数');
            return;
        }

        const client = targetUrl.startsWith('https') ? https : http;
        const options = {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Referer': referer
            },
            timeout: 15000
        };

        const proxyReq = client.get(targetUrl, options, (proxyRes) => {
            if (parsedUrl.pathname === '/api/image') {
                res.writeHead(proxyRes.statusCode, proxyRes.headers);
            } else {
                res.writeHead(proxyRes.statusCode, {
                    'Content-Type': 'application/json; charset=utf-8',
                    'Access-Control-Allow-Origin': '*'
                });
            }
            proxyRes.pipe(res);
        });

        proxyReq.on('error', (e) => {
            res.writeHead(500);
            res.end(JSON.stringify({ error: e.message }));
        });

    } else {
        res.writeHead(404);
        res.end('Not Found: ' + parsedUrl.pathname);
    }
});

function serveFile(res, filePath) {
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(`❌ 找不到文件: ${path.basename(filePath)}<br>请确保它和 server.js 在同一个文件夹里！`);
        } else {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(data);
        }
    });
}

server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n=========================================`);
    console.log(`✅ 服务端已启动！`);
    console.log(`💻 本机/局域网访问端口: ${PORT}`);
    
    const ifaces = os.networkInterfaces();
    Object.keys(ifaces).forEach((ifname) => {
        ifaces[ifname].forEach((iface) => {
            if ('IPv4' === iface.family && !iface.internal) {
                console.log(`📱 局域网IP: http://${iface.address}:${PORT}`);
            }
        });
    });
    console.log(`=========================================\n`);
}).on('error', (err) => {
    console.error(`\n❌ 启动失败：${err.message}`);
});