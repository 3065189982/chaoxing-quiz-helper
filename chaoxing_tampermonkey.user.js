// ==UserScript==
// @name         学习通批量搜题(文本匹配+qid填值)
// @namespace    http://tampermonkey.net/
// @version      8.2
// @description  全局文本匹配所有题目，通过隐藏input设值提交答案
// @author       User
// @match        https://*.chaoxing.com/*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    "use strict";
    const DEFAULT_VOLC_KEY = "这里填你的火山引擎API Key";
    const VOLC_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
    const VOLC_MODEL_ID = "doubao-1-5-pro-32k-250115";
    const CACHE_KEY = "chaoxing_answer_cache";

    GM_addStyle("#autoSearchBox{position:fixed;top:80px;right:10px;width:440px;background:#fff;border:2px solid #ff6b00;border-radius:10px;padding:14px;z-index:999999;box-shadow:0 2px 15px #00000040;max-height:85vh;overflow-y:auto;font-size:13px}#autoSearchBox .p-title{font-size:15px;font-weight:bold;margin-bottom:8px;color:#ff6b00}#autoSearchBox .p-close{float:right;color:red;cursor:pointer}#autoSearchBox .p-row{margin:6px 0}#autoSearchBox .p-input{width:100%;padding:5px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}#autoSearchBox .p-btn{border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px;margin:2px}#autoSearchBox .p-btn-orange{background:#ff6b00;color:#fff}#autoSearchBox .p-btn-green{background:#27ae60;color:#fff}#autoSearchBox .p-btn-red{background:#f5222d;color:#fff}#autoSearchBox .p-btn-blue{background:#1890ff;color:#fff}#autoSearchBox .p-log{margin-top:8px;white-space:pre-wrap;line-height:1.4;font-size:12px;max-height:320px;overflow-y:auto;background:#fafafa;padding:6px;border-radius:4px}");

    const panel = document.createElement("div"); panel.id = "autoSearchBox";
    const savedKey = GM_getValue("volc_api_key", DEFAULT_VOLC_KEY);
    panel.innerHTML = '<span class="p-close">X 关闭</span><div class="p-title">批量搜题（qid填值版）</div><div class="p-row"><input class="p-input" id="volcKeyInput" placeholder="API Key" value="' + savedKey + '"></div><div class="p-row"><button class="p-btn p-btn-blue" id="saveVolcKey">保存</button><button class="p-btn p-btn-orange" id="singleSearch">单题</button><button class="p-btn p-btn-green" id="batchAllSearch">批量</button><button class="p-btn p-btn-red" id="clearLocalAns">清缓存</button></div><div class="p-log" id="logText">等待执行...</div>';
    document.body.appendChild(panel);

    const logDom = document.getElementById("logText");
    function log(msg) { const t = new Date().toLocaleTimeString(); logDom.innerText += "[" + t + "] " + msg + "\n"; logDom.scrollTop = logDom.scrollHeight; }
    panel.querySelector(".p-close").onclick = () => panel.remove();

    document.getElementById("saveVolcKey").onclick = () => { const k = document.getElementById("volcKeyInput").value.trim(); if (!k) { log("Key不能为空"); return; } GM_setValue("volc_api_key", k); log("密钥已保存"); };
    document.getElementById("clearLocalAns").onclick = () => { GM_setValue(CACHE_KEY, "{}"); log("缓存已清空"); };

    function getCache() { try { return JSON.parse(GM_getValue(CACHE_KEY, "{}")); } catch { return {}; } }
    function saveCache(qText, ans) { const c = getCache(); c[qText] = ans; GM_setValue(CACHE_KEY, JSON.stringify(c)); }

    function getAllQuestionBlocks() {
        const blocks = [], allEls = document.querySelectorAll("div, span, label");
        const qReg = /^\d+\.\s*\((单选|多选|判断)题\)/;
        let cur = null;
        allEls.forEach(el => {
            const txt = el.innerText.trim();
            if (!txt) return;
            if (qReg.test(txt)) { if (cur) blocks.push(cur); cur = { fullText: txt, optDivs: [], qid: "" }; return; }
            if (!cur) return;
            const cls = el.className || "";
            if (/^[ABCD]$/i.test(txt) && cls.match(/choice\d+/)) {
                const m = cls.match(/choice(\d+)/);
                if (m && !cur.qid) cur.qid = m[1];
                let dup = false; for (let k = 0; k < cur.optDivs.length; k++) { if (cur.optDivs[k] === el) { dup = true; break; } }
                if (!dup) cur.optDivs.push(el);
            }
        });
        if (cur) blocks.push(cur);
        return blocks;
    }

    function clickOptions(qBlock, targetLetters) {
        if (!targetLetters || targetLetters.length === 0) return;
        const lettersArr = typeof targetLetters === "string" ? targetLetters.split("") : targetLetters;
        if (qBlock.qid) {
            const ansInput = document.getElementById("answer" + qBlock.qid);
            const typeInput = document.getElementById("answertype" + qBlock.qid);
            const qType = typeInput ? parseInt(typeInput.value) : 0;
            if (ansInput) {
                if (qType === 3) ansInput.value = lettersArr.indexOf("A") >= 0 ? "true" : "false";
                else if (qType === 1) ansInput.value = lettersArr.join(",");
                else ansInput.value = lettersArr[0] || "";
                ansInput.dispatchEvent(new Event("change", { bubbles: true }));
                ansInput.dispatchEvent(new Event("input", { bubbles: true }));
                log("设值 #answer" + qBlock.qid + " = " + ansInput.value);
            }
        }
        qBlock.optDivs.forEach(optDiv => {
            const txt = optDiv.innerText.trim();
            const letter = txt.charAt(0).toUpperCase();
            if (!lettersArr.includes(letter)) return;
            clickEl(optDiv);
            const parent = optDiv.closest(".stem_answer") || optDiv.parentElement;
            if (parent) clickEl(parent);
        });
    }

    function clickEl(el) {
        if (!el) return;
        try { el.dispatchEvent(new MouseEvent("mousedown", {bubbles:true,cancelable:true}));
            el.dispatchEvent(new MouseEvent("mouseup", {bubbles:true,cancelable:true}));
            el.dispatchEvent(new MouseEvent("click", {bubbles:true,cancelable:true}));
            el.style.background = "#ffeeda"; } catch (e) {}
        const inputs = el.querySelectorAll("input[type=radio], input[type=checkbox]");
        inputs.forEach(inp => { inp.checked = true; inp.dispatchEvent(new Event("change", {bubbles:true})); inp.dispatchEvent(new Event("input", {bubbles:true})); });
    }

    function reqVolcAI(questionText, callback) {
        const volcKey = GM_getValue("volc_api_key", DEFAULT_VOLC_KEY);
        const sysPrompt = "你是答题助手，严格执行：\n1. 单选仅输出1个大写字母(A/B/C/D)；\n2. 多选连续输出全部正确字母，无空格、标点、换行；\n3. 判断输出A(代表对/正确)或B(代表错/错误)；\n4. 禁止输出任何解析、解释、多余文字，只允许ABCD字符。";
        GM_xmlhttpRequest({
            method: "POST", url: VOLC_API_URL,
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + volcKey },
            data: JSON.stringify({ model: VOLC_MODEL_ID, messages: [{ role: "system", content: sysPrompt }, { role: "user", content: questionText }], temperature: 0, max_tokens: 10, stream: false }),
            timeout: 25000,
            onload: res => {
                try {
                    const json = JSON.parse(res.responseText);
                    if (json.error) { log("API报错: " + json.error.message); callback(""); return; }
                    const raw = json.choices?.[0]?.message?.content?.trim() || "";
                    const match = raw.toUpperCase().match(/[ABCD]/g);
                    callback(match ? match.join("") : "");
                } catch (err) { log("解析异常: " + err.message); callback(""); }
            },
            onerror: () => { log("API超时/网络失败"); callback(""); }
        });
    }

    document.getElementById("singleSearch").onclick = () => {
        log("----- 单题 -----");
        const list = getAllQuestionBlocks();
        if (list.length === 0) { log("未检测到题目"); return; }
        const q = list[0];
        log("qid=" + q.qid + " " + q.fullText.substring(0, 40) + "...");
        const cache = getCache();
        if (cache[q.fullText]) { log("缓存: " + cache[q.fullText]); clickOptions(q, cache[q.fullText]); return; }
        reqVolcAI(q.fullText, ans => { if (ans) { log("AI: " + ans); saveCache(q.fullText, ans); clickOptions(q, ans); } else log("无答案"); });
    };

    document.getElementById("batchAllSearch").onclick = async () => {
        log("============= 批量 =============");
        log("滚动加载...");
        const step = window.innerHeight * 0.8;
        for (let s = 0; s < document.body.scrollHeight; s += step) { window.scrollTo(0, s); await new Promise(r => setTimeout(r, 200)); }
        window.scrollTo(0, 0); await new Promise(r => setTimeout(r, 500));
        const list = getAllQuestionBlocks();
        if (list.length === 0) { log("未检测到题目"); return; }
        log("找到 " + list.length + " 题");
        const cache = getCache();
        for (let i = 0; i < list.length; i++) {
            const q = list[i];
            log("[" + (i+1) + "/" + list.length + "] qid=" + q.qid + " " + q.fullText.replace(/\s+/g," ").substring(0,35) + "...");
            if (q.qid) { const inp = document.getElementById("answer" + q.qid); if (inp && inp.value !== "") { log("  已有值: " + inp.value); continue; } }
            if (cache[q.fullText]) { log("  缓存: " + cache[q.fullText]); clickOptions(q, cache[q.fullText]); continue; }
            await new Promise(resolve => {
                reqVolcAI(q.fullText, ans => { if (ans) { log("  AI: " + ans); saveCache(q.fullText, ans); clickOptions(q, ans); } else log("  无答案"); resolve(); });
            });
            if (i < list.length - 1) await new Promise(r => setTimeout(r, 1200));
        }
        log("============= 完成 =============");
        if (typeof saveWork === "function") { try { saveWork(); log("已调用 saveWork()"); } catch(e) { log("saveWork: " + e.message); } }
        else if (typeof top.saveWork === "function") { try { top.saveWork(); } catch(e) {} }
        else if (typeof saveAnswer === "function") { try { saveAnswer(); } catch(e) {} }
    };
})();

