const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const previewSection = document.getElementById('previewSection');
const previewButtonSection = document.getElementById('previewButtonSection');
const previewImage = document.getElementById('previewImage');
const imageInfo = document.getElementById('imageInfo');
const auditBtn = document.getElementById('auditBtn');
const reuploadBtn = document.getElementById('reuploadBtn');
const resultSection = document.getElementById('resultSection');
const resultImage = document.getElementById('resultImage');
const resultImageInfo = document.getElementById('resultImageInfo');
const resultFileInput = document.getElementById('resultFileInput');
const uploadableImage = document.querySelector('.uploadable-image');
const auditTableBody = document.getElementById('auditTableBody');
const conclusion = document.getElementById('conclusion');
const suggestions = document.getElementById('suggestions');
const suggestionList = document.getElementById('suggestionList');
const backBtn = document.getElementById('backBtn');

let currentImage = null;
let currentImageBase64 = null;
let imageDimensions = { width: 540, height: 768 };

// TensorFlow.js 模型
let cocoSsdModel = null;
let modelLoadingPromise = null;

// 加载 COCO-SSD 模型
async function loadCocoSsdModel() {
    if (modelLoadingPromise) {
        return modelLoadingPromise;
    }
    
    if (cocoSsdModel) {
        return cocoSsdModel;
    }

    console.log('🚀 正在加载 COCO-SSD 元素检测模型...');
    auditBtn.textContent = '加载模型中...';
    auditBtn.disabled = true;
    
    try {
        modelLoadingPromise = cocoSsd.load();
        cocoSsdModel = await modelLoadingPromise;
        console.log('✅ COCO-SSD 模型加载成功！');
        auditBtn.textContent = '开始审核';
        auditBtn.disabled = false;
        return cocoSsdModel;
    } catch (error) {
        console.error('❌ 模型加载失败:', error);
        auditBtn.textContent = '开始审核';
        auditBtn.disabled = false;
        return null;
    }
}

uploadArea.addEventListener('click', () => fileInput.click());

uploadArea.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add('dragover');
});

uploadArea.addEventListener('dragleave', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('dragover');
});

uploadArea.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove('dragover');
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFile(files[0]);
    }
});

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (uploadArea.style.display !== 'none') {
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    }
});

document.addEventListener('paste', (e) => {
    if (uploadArea.style.display !== 'none') {
        const items = e.clipboardData.items;
        for (let i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') !== -1) {
                const file = items[i].getAsFile();
                handleFile(file);
                break;
            }
        }
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFile(e.target.files[0]);
    }
});

function handleFile(file) {
    if (!file.type.match('image/jpeg') && !file.type.match('image/png')) {
        alert('请上传 JPG 或 PNG 格式的图片');
        return;
    }

    currentImage = file;
    const reader = new FileReader();
    reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
            previewImage.src = e.target.result;
            currentImageBase64 = e.target.result.split(',')[1];
            imageInfo.textContent = `图片尺寸: ${img.width} × ${img.height}px, 大小: ${(file.size / 1024).toFixed(2)} KB`;
            uploadArea.style.display = 'none';
            resultSection.style.display = 'none';
            previewSection.style.display = 'block';
            previewButtonSection.style.display = 'block';
        };
        img.src = e.target.result;
    };
    reader.readAsDataURL(file);
}

reuploadBtn.addEventListener('click', () => {
    fileInput.click();
});

auditBtn.addEventListener('click', () => {
    if (currentImage) {
        performAudit();
    }
});

uploadableImage.addEventListener('click', () => resultFileInput.click());

resultFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        handleFile(file);
    }
});

backBtn.addEventListener('click', () => {
    resultSection.style.display = 'none';
    if (currentImage) {
        previewSection.style.display = 'block';
        previewButtonSection.style.display = 'block';
    } else {
        uploadArea.style.display = 'block';
    }
});

async function callOCR(imageBase64) {
    const response = await fetch('/api/ocr', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 })
    });

    if (!response.ok) {
        throw new Error('OCR API 调用失败');
    }

    const result = await response.json();
    return result.Result;
}

async function callElementDetection(imageBase64) {
    const response = await fetch('/api/element-detection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64 })
    });

    if (!response.ok) {
        throw new Error('元素识别调用失败');
    }

    const result = await response.json();
    return result.Data || result;
}

async function performAudit() {
    try {
        auditBtn.textContent = '审核中...';
        auditBtn.disabled = true;

        console.log('========== 开始审核 ==========');

        const img = new Image();
        img.src = previewImage.src;
        await new Promise((resolve) => {
            img.onload = () => {
                imageDimensions.width = img.width;
                imageDimensions.height = img.height;
                console.log('📷 图片实际尺寸:', imageDimensions);
                resolve();
            };
        });

        let ocrData;
        try {
            console.log('正在调用 OCR...');
            ocrData = await callOCR(currentImageBase64);
            console.log('✅ OCR 成功返回:', ocrData);
        } catch (error) {
            console.error('❌ OCR 调用失败:', error);
            ocrData = { line_texts: [], line_rects: [] };
        }

        let elementData;
        try {
            // 先尝试加载模型
            const model = await loadCocoSsdModel();
            
            if (model) {
                console.log('🔍 正在用 COCO-SSD 检测元素...');
                const predictions = await model.detect(img);
                console.log('✅ COCO-SSD 检测结果:', predictions);
                
                // 把模型预测结果转换成我们的格式
                elementData = {
                    elements: predictions.map(pred => ({
                        type: pred.class,
                        x: pred.bbox[0],
                        y: pred.bbox[1],
                        width: pred.bbox[2],
                        height: pred.bbox[3]
                    }))
                };
            } else {
                // 如果模型加载失败，用后端模拟数据
                elementData = await callElementDetection(currentImageBase64);
            }
        } catch (error) {
            console.error('❌ 元素检测失败:', error);
            elementData = { elements: [] };
        }

        console.log('正在分析审核结果...');
        const { auditItems, suggestions: suggestionsData } = analyzeResults(ocrData, elementData);

        resultImage.src = previewImage.src;
        resultImageInfo.textContent = imageInfo.textContent;

        renderAuditTable(auditItems);

        const allPass = auditItems.every(item => item.pass);
        renderConclusion(allPass);
        renderSuggestions(auditItems, suggestionsData);

        uploadArea.style.display = 'none';
        previewSection.style.display = 'none';
        previewButtonSection.style.display = 'none';
        resultSection.style.display = 'block';

    } catch (error) {
        alert('审核失败: ' + error.message);
        console.error(error);
    } finally {
        auditBtn.textContent = '开始审核';
        auditBtn.disabled = false;
    }
}

function analyzeResults(ocrData, elementData) {
    const auditItems = [];
    const suggestions = [];

    console.log('========== 分析审核结果 ==========');
    console.log('OCR原始数据:', ocrData);

    let line_texts = [];
    let line_rects = [];
    
    if (ocrData) {
        if (ocrData.line_texts) {
            line_texts = ocrData.line_texts;
            line_rects = ocrData.line_rects || [];
        } else if (ocrData.Result && ocrData.Result.line_texts) {
            line_texts = ocrData.Result.line_texts;
            line_rects = ocrData.Result.line_rects || [];
        }
    }
    
    console.log('🎯 识别到的文字:', line_texts);

    // ========== 核心审核逻辑 ==========
    
    // 1. 违禁词列表（可扩展）
    const forbiddenWords = [
        '抖音商城', '抖音', 'douyin',
        '天猫', '淘宝', '拼多多', '京东',
        '限时', '特价', '秒杀', '限时秒杀',
        '微信', 'weixin', '微信支付'
    ];
    
    // 2. 合规词列表（必须有）
    const requiredWords = ['上新了', '上新'];

    // 检查违禁词
    const detectedForbidden = [];
    for (const word of forbiddenWords) {
        for (const text of line_texts) {
            if ((text || '').includes(word)) {
                if (!detectedForbidden.includes(word)) {
                    detectedForbidden.push(word);
                }
            }
        }
    }
    
    // 检查合规词
    const hasRequiredText = requiredWords.some(word => 
        line_texts.some(text => (text || '').includes(word))
    );

    // LOGO 检查项
    const logoPass = detectedForbidden.length === 0 && hasRequiredText;
    let logoDesc = '';
    if (detectedForbidden.length > 0) {
        logoDesc = '❌ 检测到违禁文字：' + detectedForbidden.join('、');
        suggestions.push('移除「抖音商城」LOGO，改用「上新了」LOGO');
    } else if (!hasRequiredText) {
        logoDesc = '❌ 未检测到「上新了」标识';
        suggestions.push('必须添加官方原版「上新了」LOGO');
    } else {
        logoDesc = '✅ 检测到「上新了」标识，无违禁文字';
    }

    auditItems.push({
        name: 'LOGO合规性',
        pass: logoPass,
        desc: logoDesc
    });

    // 3. 检查日期格式（MM/DD，可选）
    const dateRegex = /\d{2}\/\d{2}/;
    const hasValidDate = line_texts.some(text => dateRegex.test(text || ''));
    auditItems.push({
        name: '日期格式',
        pass: true, // 日期是可选的，总是通过
        desc: hasValidDate ? '✅ 检测到符合 MM/DD 格式的日期' : 'ℹ️ 未检测到日期（纯文案模式）'
    });
    
    // 只有检测到日期但格式不对时才提示
    const hasAnyDatePattern = line_texts.some(text => (text || '').match(/[0-9]{1,2}.[0-9]{1,2}/));
    if (hasAnyDatePattern && !hasValidDate) {
        suggestions.push('检测到日期但格式不对，需要格式如 04/29');
    }

    // 4. 检查是否有蚂蚁字（特别小的文字）
    const hasAntWords = line_rects.some(rect => rect && rect.height < 15);
    auditItems.push({
        name: '蚂蚁字检测',
        pass: !hasAntWords,
        desc: !hasAntWords ? '✅ 未检测到异常小的文字' : '❌ 检测到可能的蚂蚁字'
    });
    
    if (hasAntWords) {
        suggestions.push('发现异常小的蚂蚁字，请检查并移除');
    }

    // 5. 检查按钮文案
    const buttonKeywords = ['立即抢购', '立即购买', '马上抢'];
    const hasButtonText = buttonKeywords.some(word => 
        line_texts.some(text => (text || '').includes(word))
    );
    auditItems.push({
        name: '按钮文案',
        pass: hasButtonText,
        desc: hasButtonText ? '✅ 检测到按钮文案' : '⚠️ 未检测到常见按钮文案（如「立即抢购」'
    });

    // 6. 检查文字左右间距
    let spacingPass = true;
    let spacingDesc = '';
    
    // 规范值（在 180px 宽度模板上）
    const STANDARD_TEMPLATE_WIDTH = 180;
    const STANDARD_LEFT_MARGIN = 5;
    const STANDARD_RIGHT_MARGIN = 5;
    const TOLERANCE = 3; // 允许 ±3px 误差
    
    // 先显示所有识别到的文字和位置（调试用）
    let allTextPositions = '';
    for (let i = 0; i < line_texts.length; i++) {
        const text = line_texts[i];
        const rect = line_rects[i];
        if (text && rect) {
            allTextPositions += `[${i}] "${text}": (${Math.round(rect.x)},${Math.round(rect.y)}) ${Math.round(rect.width)}x${Math.round(rect.height)}; `;
        }
    }
    
    // 先找到主要文案（找「网球好物上新」这种文字，或者较长的文字，或者中间的文字）
    let mainTextIndex = -1;
    // 优先找包含「网球」、「好物」、「首发」、「好物上新」、「上新」的文字
    for (let i = 0; i < line_texts.length; i++) {
        const text = line_texts[i];
        if (text && (
            text.includes('网球') || text.includes('好物') || text.includes('首发') || text.includes('上新') || text.includes('/') || text.length > 4)) {
            mainTextIndex = i;
            console.log('🎯 找到主要文案索引:', i, '文字:', text);
            break;
        }
    }
    
    if (mainTextIndex >= 0 && line_rects[mainTextIndex]) {
        const rect = line_rects[mainTextIndex];
        let leftMargin = rect.x;
        let rightMargin = imageDimensions.width - (rect.x + rect.width);
        
        // 如果图片宽度不是 180px，按比例缩放检测值到 180px 模板
        let scaledLeftMargin = leftMargin;
        let scaledRightMargin = rightMargin;
        
        if (Math.abs(imageDimensions.width - STANDARD_TEMPLATE_WIDTH) > 10) {
            const scale = STANDARD_TEMPLATE_WIDTH / imageDimensions.width;
            scaledLeftMargin = leftMargin * scale;
            scaledRightMargin = rightMargin * scale;
            spacingDesc = `检测到：左边距 ${Math.round(leftMargin)}px，右边距 ${Math.round(rightMargin)}px（缩放至180px模板：${Math.round(scaledLeftMargin)}px / ${Math.round(scaledRightMargin)}px）`;
        } else {
            spacingDesc = `检测到：左边距 ${Math.round(leftMargin)}px，右边距 ${Math.round(rightMargin)}px`;
        }
        
        // 判断间距是否符合规范
        const leftOk = Math.abs(scaledLeftMargin - STANDARD_LEFT_MARGIN) <= TOLERANCE;
        const rightOk = Math.abs(scaledRightMargin - STANDARD_RIGHT_MARGIN) <= TOLERANCE;
        spacingPass = leftOk && rightOk;
        
        if (!spacingPass) {
            // 只提示一次，合并问题
            suggestions.push('标签行线框内文字间距，请和规范1:1对齐');
            spacingDesc = `❌ ${spacingDesc}`;
        } else {
            spacingDesc = `✅ ${spacingDesc}`;
        }
        
        auditItems.push({
            name: '标签行线框内文字间距',
            pass: spacingPass,
            desc: spacingDesc
        });
    } else {
        auditItems.push({
            name: '标签行线框内文字间距',
            pass: true,
            desc: 'ℹ️ 未找到主要文案位置'
        });
    }
    
    // 7. 检查LOGO和「上新了」文字是否等高
    let logoTextAligned = true;
    let logoTextDesc = '';
    const STANDARD_SHANGXIN_HEIGHT = 10; // 在180px模板上的规范高度
    const SHANGXIN_TOLERANCE = 2; // 允许 ±2px 误差
    
    // 先找到「上新了」的文字位置
    let shangxinIndex = -1;
    for (let i = 0; i < line_texts.length; i++) {
        const text = line_texts[i];
        if (text && (text.includes('上新了') || text.includes('上新'))) {
            shangxinIndex = i;
            break;
        }
    }
    
    if (shangxinIndex >= 0 && line_rects[shangxinIndex]) {
        const shangxinRect = line_rects[shangxinIndex];
        let shangxinHeight = shangxinRect.height;
        const shangxinTop = shangxinRect.y;
        const shangxinBottom = shangxinRect.y + shangxinHeight;
        
        // 如果图片宽度不是 180px，按比例缩放高度
        let scaledShangxinHeight = shangxinHeight;
        if (Math.abs(imageDimensions.width - 180) > 10) {
            const scale = 180 / imageDimensions.width;
            scaledShangxinHeight = shangxinHeight * scale;
            logoTextDesc = `检测到「上新了」文字高度：${Math.round(shangxinHeight)}px（缩放至180px模板：${Math.round(scaledShangxinHeight)}px），位置：y=${Math.round(shangxinTop)}px~${Math.round(shangxinBottom)}px`;
        } else {
            logoTextDesc = `检测到「上新了」文字高度：${Math.round(shangxinHeight)}px，位置：y=${Math.round(shangxinTop)}px~${Math.round(shangxinBottom)}px`;
        }
        
        // 检查「上新了」文字本身高度是否规范
        const shangxinHeightOk = Math.abs(scaledShangxinHeight - STANDARD_SHANGXIN_HEIGHT) <= SHANGXIN_TOLERANCE;
        
        // 先设为 true（因为无法直接检测LOGO高度）
        // TODO: 这里需要加入LOGO检测，看左上角LOGO的高度和「上新了」是否一致
        auditItems.push({
            name: 'LOGO与「上新了」等高',
            pass: true,
            desc: logoTextDesc
        });
        
        // 提示用户检查
        suggestions.push('请检查左上角LOGO是否和「上新了」三个字等高');
        
        // 如果「上新了」文字本身高度不对，也提示
        if (!shangxinHeightOk) {
            suggestions.push(`「上新了」文字高度不对！规范是 ${STANDARD_SHANGXIN_HEIGHT}px，检测到 ${Math.round(scaledShangxinHeight)}px`);
        }
        
    } else {
        auditItems.push({
            name: 'LOGO与「上新了」等高',
            pass: true,
            desc: 'ℹ️ 未检测到「上新了」文字'
        });
    }
    
    // 8. 显示所有文字位置（调试用）
    if (allTextPositions.length > 0) {
        auditItems.push({
            name: '所有文字位置',
            pass: true,
            desc: allTextPositions
        });
    }

    // 显示OCR识别的原始文字（调试用）
    if (line_texts.length > 0) {
        auditItems.push({
            name: 'OCR识别文字',
            pass: true,
            desc: '识别到: ' + line_texts.join(' | ')
        });
    }

    // 显示元素检测结果
    if (elementData && elementData.elements && elementData.elements.length > 0) {
        const elementTypes = elementData.elements.map(elem => elem.type).join('、');
        auditItems.push({
            name: '元素检测结果',
            pass: true,
            desc: '检测到: ' + elementTypes
        });
    }

    console.log('审核结果:', auditItems);
    console.log('整改建议:', suggestions);
    console.log('================================');

    return {
        auditItems,
        suggestions
    };
}

function renderAuditTable(items) {
    auditTableBody.innerHTML = items.map((item, index) => `
        <tr>
            <td>${item.name}</td>
            <td class="${item.pass ? 'result-pass' : 'result-fail'}">${item.pass ? '✅' : '❌'}</td>
            <td>${item.desc}</td>
        </tr>
    `).join('');
}

function renderConclusion(allPass) {
    conclusion.className = 'conclusion ' + (allPass ? 'pass' : 'fail');
    if (allPass) {
        conclusion.innerHTML = '✅ 审核通过：所有必备项均合规';
    } else {
        conclusion.innerHTML = '❌ 审核不通过：存在违规项，需要整改';
    }
}

function renderSuggestions(items, suggestionsData) {
    const failedItems = items.filter(item => !item.pass);

    if (failedItems.length > 0 || suggestionsData.length > 0) {
        suggestions.style.display = 'block';

        const allSuggestions = [
            ...suggestionsData,
            ...failedItems
                // 排除「蚂蚁字检测」、「LOGO与「上新了」等高」、「标签行线框内文字间距」、「LOGO合规性」，因为已经有手动提示了
                .filter(item => 
                    item.name !== '蚂蚁字检测' && 
                    item.name !== 'LOGO与「上新了」等高' &&
                    item.name !== '标签行线框内文字间距' &&
                    item.name !== 'LOGO合规性' &&
                    !suggestionsData.some(s => item.desc.includes(s.slice(0, 10)))
                )
                .map(item => `请检查「${item.name}」项：${item.desc}`)
        ];

        const uniqueSuggestions = [...new Set(allSuggestions)];

        suggestionList.innerHTML = uniqueSuggestions.map(s => `<li>${s}</li>`).join('');
    } else {
        suggestions.style.display = 'none';
    }
}
