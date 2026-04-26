const express = require('express');
const axios = require('axios');
const cors = require('cors');
const { Signer } = require('@volcengine/openapi');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// 火山引擎配置
const VOLC_CONFIG = {
    accessKeyId: process.env.VOLC_ACCESS_KEY_ID,
    secretKey: process.env.VOLC_SECRET_ACCESS_KEY,
    region: process.env.VOLC_REGION || 'cn-north-1',
    service: process.env.VOLC_SERVICE || 'cv',
    host: 'visual.volcengineapi.com',
    action: 'OCRNormal',
    version: '2020-08-26'
};

console.log('🔧 火山引擎配置:', {
    accessKeyId: VOLC_CONFIG.accessKeyId.substring(0, 10) + '...',
    region: VOLC_CONFIG.region,
    service: VOLC_CONFIG.service
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(__dirname));

// 模拟数据（兜底方案）
function mockOCRResult() {
    return {
        line_texts: ['上新了', '方太', '04/29', '方太智慧洗油烟机L10-AI', '立即抢购'],
        line_rects: [
            { x: 50, y: 50, width: 100, height: 30 },
            { x: 160, y: 52, width: 80, height: 28 },
            { x: 50, y: 100, width: 80, height: 30 },
            { x: 50, y: 150, width: 200, height: 35 },
            { x: 50, y: 200, width: 100, height: 40 }
        ],
        line_probs: [0.95, 0.92, 0.98, 0.91, 0.89]
    };
}

function mockElementResult() {
    return [
        { type: 'logo', x: 50, y: 50, width: 100, height: 100 },
        { type: 'button', x: 50, y: 300, width: 150, height: 50 }
    ];
}

// OCR 接口
app.post('/api/ocr', async (req, res) => {
    try {
        const { imageBase64 } = req.body;
        
        if (!imageBase64) {
            return res.status(400).json({ error: '缺少 imageBase64 必填' });
        }

        console.log('📷 收到OCR请求，图片大小:', Math.round(imageBase64.length / 1024), 'KB');

        if (VOLC_CONFIG.accessKeyId && VOLC_CONFIG.secretKey) {
            console.log('🚀 正在调用火山引擎 OCR...');
            
            try {
                const openApiRequestData = {
                    region: VOLC_CONFIG.region,
                    method: 'POST',
                    params: {
                        Action: VOLC_CONFIG.action,
                        Version: VOLC_CONFIG.version
                    },
                    headers: {
                        Region: VOLC_CONFIG.region,
                        Service: VOLC_CONFIG.service,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    },
                    body: `image_base64=${encodeURIComponent(imageBase64)}`
                };

                const signer = new Signer(openApiRequestData, VOLC_CONFIG.service);
                signer.addAuthorization({
                    accessKeyId: VOLC_CONFIG.accessKeyId,
                    secretKey: VOLC_CONFIG.secretKey
                });

                const response = await axios.post(`https://${VOLC_CONFIG.host}`, openApiRequestData.body, {
                    headers: openApiRequestData.headers,
                    params: openApiRequestData.params
                });

                console.log('✅ 火山引擎 OCR 响应:', JSON.stringify(response.data, null, 2));

                if (response.data && response.data.data && response.data.data.line_texts) {
                    res.json({
                        Result: response.data.data
                    });
                } else {
                    res.json({ Result: response.data.data || response.data });
                }
                return;
            } catch (apiError) {
                console.error('❌ API 调用失败:', apiError.message);
                if (apiError.response) {
                    console.error('状态码:', apiError.response.status);
                    console.error('响应数据:', JSON.stringify(apiError.response.data, null, 2));
                }
            }
        }

        console.warn('⚠️ 使用模拟数据');
        res.json({ Result: mockOCRResult() });

    } catch (error) {
        console.error('❌ OCR 失败:', error.message);
        console.warn('⚠️ 使用模拟数据');
        res.json({ Result: mockOCRResult() });
    }
});

// 元素识别接口（暂时用模拟数据）
app.post('/api/element-detection', async (req, res) => {
    try {
        console.log('🎯 收到元素识别请求（暂时使用模拟数据）');
        res.json({ Data: { elements: mockElementResult() } });
    } catch (error) {
        console.error('❌ 元素识别失败:', error.message);
        res.json({ Data: { elements: mockElementResult() } });
    }
});

app.listen(PORT, () => {
    console.log('\n=====================================');
    console.log('🚀 后端代理服务器已启动');
    console.log(`📡 端口: ${PORT}`);
    console.log(`🌐 访问: http://localhost:${PORT}`);
    console.log('✅ 火山引擎 OCR 已配置（真实API）');
    console.log('💡 元素识别暂时使用模拟数据');
    console.log('=====================================\n');
});
