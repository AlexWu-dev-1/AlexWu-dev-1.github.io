const crypto = require('crypto');
const https = require('https');
const fs = require('fs');
const path = require('path');

// ============ 加载配置 ============
require('dotenv').config();

const ALIYUN_CONFIG = {
    accessKeyId: process.env.ALIYUN_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.ALIYUN_SECRET_ACCESS_KEY || '',
    endpoint: process.env.ALIYUN_ENDPOINT || 'imagerecog.cn-shanghai.aliyuncs.com',
    apiVersion: process.env.ALIYUN_API_VERSION || '2019-09-30',
    region: process.env.ALIYUN_REGION || 'cn-shanghai'
};

// ============ 加密工具函数 ============
function toHex(value) {
    return Array.prototype.map.call(new Uint8Array(value), x => ('00' + x.toString(16)).slice(-2)).join('');
}

function sha256(data) {
    return crypto.createHash('sha256').update(data).digest('hex');
}

function hmacSHA256Raw(key, data) {
    if (typeof key === 'string') {
        key = Buffer.from(key, 'utf8');
    }
    return crypto.createHmac('sha256', key).update(data).digest();
}

// ============ 阿里云签名函数 ============
function createAliyunSignature(config, method, uri, queryParams, body) {
    const now = new Date();
    const timestamp = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    
    const hashedPayload = sha256(body || '');
    
    const headers = {
        'host': config.endpoint,
        'x-acs-action': 'DetectImageElements',
        'x-acs-date': timestamp,
        'x-acs-signature-method': 'HMAC-SHA256',
        'x-acs-signature-version': '1.0',
        'x-acs-version': config.apiVersion,
        'x-acs-region-id': config.region
    };
    
    const signedHeaders = Object.keys(headers).filter(k => k.toLowerCase().startsWith('x-acs-') || k.toLowerCase() === 'host').sort().join(';');
    
    let canonicalHeaders = '';
    for (const key of Object.keys(headers).sort()) {
        canonicalHeaders += `${key.toLowerCase()}:${headers[key]}\n`;
    }
    
    let canonicalQueryString = '';
    if (queryParams) {
        const sortedParams = Object.keys(queryParams).sort();
        canonicalQueryString = sortedParams
            .map(key => `${encodeURIComponent(key)}=${encodeURIComponent(queryParams[key])}`)
            .join('&');
    }
    
    const canonicalRequest = `${method}\n${uri}\n${canonicalQueryString}\n${canonicalHeaders}\n${signedHeaders}\n${hashedPayload}`;
    
    const hashedCanonicalRequest = sha256(canonicalRequest);
    
    const credentialScope = `${timestamp.substring(0, 10)}/${config.region}/imagerecog/aliyun_request`;
    const stringToSign = `ACS3-HMAC-SHA256\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`;
    
    let kDate = hmacSHA256Raw(config.secretAccessKey, timestamp.substring(0, 10));
    let kRegion = hmacSHA256Raw(kDate, config.region);
    let kService = hmacSHA256Raw(kRegion, 'imagerecog');
    let kSigning = hmacSHA256Raw(kService, 'aliyun_request');
    const signatureBytes = hmacSHA256Raw(kSigning, stringToSign);
    const signature = toHex(signatureBytes);
    
    const authorization = `ACS3-HMAC-SHA256 Credential=${config.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
    
    return {
        authorization,
        timestamp,
        hashedPayload,
        headers
    };
}

// ============ 测试阿里云API ============
async function testAliyunAPI(testImagePath) {
    console.log('='.repeat(60));
    console.log('阿里云元素识别 API 测试');
    console.log('='.repeat(60));
    
    // 检查配置
    console.log('\n1. 检查配置...');
    console.log('   AccessKeyId:', ALIYUN_CONFIG.accessKeyId ? '已配置 ✓' : '未配置 ✗');
    console.log('   SecretAccessKey:', ALIYUN_CONFIG.secretAccessKey ? '已配置 ✓' : '未配置 ✗');
    
    if (!ALIYUN_CONFIG.accessKeyId || !ALIYUN_CONFIG.secretAccessKey) {
        console.error('\n❌ 错误：缺少阿里云密钥配置！');
        process.exit(1);
    }
    
    console.log('\n2. 加载测试图片...');
    let imageBase64 = '';
    
    if (testImagePath && fs.existsSync(testImagePath)) {
        const imageBuffer = fs.readFileSync(testImagePath);
        imageBase64 = imageBuffer.toString('base64');
        console.log(`   ✓ 已加载图片: ${path.basename(testImagePath)}`);
        console.log(`   ✓ 图片大小: ${(imageBuffer.length / 1024).toFixed(2)} KB`);
    } else {
        console.log('   ⚠️ 未提供测试图片，使用模拟数据');
        console.log('   💡 提示：运行 node test-aliyun.js <图片路径> 可以使用真实图片测试');
        // 创建一个简单的测试base64（1x1透明PNG）
        imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    }
    
    console.log('\n3. 构建API请求...');
    
    const requestBody = JSON.stringify({
        ImageURL: '',
        ImageBase64: imageBase64
    });
    
    const { authorization, timestamp, headers } = createAliyunSignature(
        ALIYUN_CONFIG,
        'POST',
        '/',
        null,
        requestBody
    );
    
    console.log('   ✓ 请求体已构建');
    console.log('   ✓ 签名已生成');
    
    console.log('\n4. 发送API请求...');
    
    return new Promise((resolve, reject) => {
        const options = {
            hostname: ALIYUN_CONFIG.endpoint,
            port: 443,
            path: '/',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': requestBody.length,
                'Host': headers.host,
                'x-acs-action': 'DetectImageElements',
                'x-acs-date': timestamp,
                'x-acs-signature-method': 'HMAC-SHA256',
                'x-acs-signature-version': '1.0',
                'x-acs-version': ALIYUN_CONFIG.apiVersion,
                'x-acs-region-id': ALIYUN_CONFIG.region,
                'Authorization': authorization
            }
        };
        
        const req = https.request(options, (res) => {
            let data = '';
            
            res.on('data', (chunk) => {
                data += chunk;
            });
            
            res.on('end', () => {
                console.log(`   ✓ 响应状态码: ${res.statusCode}`);
                
                try {
                    const result = JSON.parse(data);
                    
                    console.log('\n5. API响应结果:');
                    console.log('─'.repeat(60));
                    console.log(JSON.stringify(result, null, 2));
                    console.log('─'.repeat(60));
                    
                    if (res.statusCode === 200) {
                        console.log('\n✅ 成功！阿里云元素识别API正常工作');
                        
                        if (result.Data && result.Data.Elements) {
                            console.log(`   检测到 ${result.Data.Elements.length} 个元素`);
                            result.Data.Elements.forEach((el, idx) => {
                                console.log(`   ${idx + 1}. ${el.Type || el.type} @ (${el.X || el.x}, ${el.Y || el.y})`);
                            });
                        }
                        resolve(result);
                    } else {
                        console.log('\n❌ API返回错误');
                        reject(result);
                    }
                } catch (e) {
                    console.error('\n❌ 解析响应失败:', e.message);
                    console.error('   原始响应:', data);
                    reject(e);
                }
            });
        });
        
        req.on('error', (error) => {
            console.error(`   ✗ 请求失败: ${error.message}`);
            reject(error);
        });
        
        req.write(requestBody);
        req.end();
    });
}

// ============ 主程序 ============
const testImagePath = process.argv[2];

testAliyunAPI(testImagePath)
    .then(() => {
        console.log('\n🎉 测试完成！');
        process.exit(0);
    })
    .catch((error) => {
        console.error('\n💥 测试失败:', error);
        process.exit(1);
    });
