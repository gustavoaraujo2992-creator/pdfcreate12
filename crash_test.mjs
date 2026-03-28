import request from 'http';
import fs from 'fs';

const req = request.request({
    hostname: 'localhost',
    port: 3001,
    path: '/api/extract',
    method: 'POST',
});

req.on('error', e => console.log('REQ ERROR:', e.message));
req.end();
