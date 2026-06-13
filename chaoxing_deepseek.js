(function () {
    "use strict";
    var VERSION = "v6.0 (火山引擎·文本匹配)";
    var VOLC_API_URL = "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
    var VOLC_MODEL_ID = "doubao-1-5-pro-32k-250115";
    var DEFAULT_VOLC_KEY = "这里填你的火山引擎API Key";
    var CACHE_KEY = "chaoxing_answer_cache";
    var API_KEY_STORAGE_KEY = "chaoxing_volc_api_key";
    console.log("%c学习通AI答题 " + VERSION, "font-size:22px;color:#1a73e8;font-weight:bold");

    function getCache() { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || "{}"); } catch { return {}; } }
    function saveCache(qText, ans) { var c = getCache(); c[qText] = ans; localStorage.setItem(CACHE_KEY, JSON.stringify(c)); }
    function clearCache() { localStorage.removeItem(CACHE_KEY); log("缓存已清空"); }
    function getApiKey() { return localStorage.getItem(API_KEY_STORAGE_KEY) || DEFAULT_VOLC_KEY; }
    function setApiKey(key) { localStorage.setItem(API_KEY_STORAGE_KEY, key); log("API Key 已保存"); }

    function getAllQuestionBlocks() {
        var allBlocks = [], allEls = document.querySelectorAll("div, span, label");
        var qReg = /^\d+\.\s*\((单选|多选|判断)题\)/, currentBlock = null;
        allEls.forEach(function (el) {
            var txt = el.innerText.trim();
            if (!txt) return;
            if (qReg.test(txt)) { if (currentBlock) allBlocks.push(currentBlock); currentBlock = { fullText: txt, optDivs: [], qid: "" }; return; }
            if (!currentBlock) return;
            var cls = el.className || "";
            if (/^[ABCD]$/i.test(txt) && cls.match(/choice\d+/)) {
                var m = cls.match(/choice(\d+)/);
                if (m && !currentBlock.qid) currentBlock.qid = m[1];
                var dup = false;
                for (var k = 0; k < currentBlock.optDivs.length; k++) { if (currentBlock.optDivs[k] === el) { dup = true; break; } }
                if (!dup) currentBlock.optDivs.push(el);
            }
        });
        if (currentBlock) allBlocks.push(currentBlock);
        return allBlocks;
    }

    function clickOptions(qBlock, targetLetters) {
        if (!targetLetters || targetLetters.length === 0) return false;
        var lettersArr = typeof targetLetters === "string" ? targetLetters.split("") : targetLetters;
        var count = 0;
        if (qBlock.qid) {
            var ansInput = document.getElementById("answer" + qBlock.qid);
            var typeInput = document.getElementById("answertype" + qBlock.qid);
            var qType = typeInput ? parseInt(typeInput.value) : 0;
            if (ansInput) {
                if (qType === 3) ansInput.value = lettersArr.indexOf("A") >= 0 ? "true" : "false";
                else if (qType === 1) ansInput.value = lettersArr.join(",");
                else ansInput.value = lettersArr[0] || "";
                ansInput.dispatchEvent(new Event("change", { bubbles: true }));
                ansInput.dispatchEvent(new Event("input", { bubbles: true }));
                count++;
                log("✅ 已设答案 #answer" + qBlock.qid + " = " + ansInput.value);
            }
        }
        qBlock.optDivs.forEach(function (optDiv) {
            var txt = optDiv.innerText.trim();
            var letter = txt.charAt(0).toUpperCase();
            if (lettersArr.indexOf(letter) === -1) return;
            clickEl(optDiv);
            var parent = optDiv.closest(".stem_answer") || optDiv.parentElement;
            if (parent) clickEl(parent);
        });
        return count > 0;
    }

    function clickEl(el) {
        if (!el) return;
        try { el.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent("mouseup", { bubbles: true, cancelable: true }));
            el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
            el.style.background = "#ffeeda"; } catch (e) {}
        var inputs = el.querySelectorAll("input[type=radio], input[type=checkbox]");
        inputs.forEach(function (inp) { inp.checked = true; inp.dispatchEvent(new Event("change", { bubbles: true })); inp.dispatchEvent(new Event("input", { bubbles: true })); });
    }

    function createPanel() {
        var old = document.getElementById("cx-panel"); if (old) old.remove();
        var s = document.createElement("style"); s.id = "cx-panel-style";
        if (!document.getElementById("cx-panel-style")) {
            s.textContent = "#cx-panel{position:fixed;top:80px;right:10px;width:420px;background:#fff;border:2px solid #ff6b00;border-radius:10px;padding:14px;z-index:999999;box-shadow:0 2px 15px rgba(0,0,0,0.25);max-height:85vh;overflow-y:auto;font-size:13px;color:#333}#cx-panel .p-title{font-size:15px;font-weight:bold;margin-bottom:8px;color:#ff6b00}#cx-panel .p-close{float:right;color:red;cursor:pointer}#cx-panel .p-row{margin:6px 0}#cx-panel .p-input{width:100%;padding:5px;box-sizing:border-box;border:1px solid #ccc;border-radius:4px}#cx-panel .p-btn{border:none;padding:5px 10px;border-radius:4px;cursor:pointer;font-size:12px;margin:2px}#cx-panel .p-btn-orange{background:#ff6b00;color:#fff}#cx-panel .p-btn-green{background:#27ae60;color:#fff}#cx-panel .p-btn-red{background:#f5222d;color:#fff}#cx-panel .p-btn-blue{background:#1890ff;color:#fff}#cx-panel .p-log{margin-top:8px;white-space:pre-wrap;line-height:1.4;font-size:12px;max-height:300px;overflow-y:auto;background:#fafafa;padding:6px;border-radius:4px}";
            document.head.appendChild(s);
        }
        var panel = document.createElement("div"); panel.id = "cx-panel";
        panel.innerHTML = '<span class="p-close" id="cx-panel-close">X 关闭</span><div class="p-title">批量搜题（文本匹配+qid填值）</div><div class="p-row"><input class="p-input" id="cx-api-key" placeholder="火山引擎 API Key" value="' + getApiKey() + '"></div><div class="p-row"><button class="p-btn p-btn-blue" id="cx-save-key">保存密钥</button><button class="p-btn p-btn-orange" id="cx-single">单题</button><button class="p-btn p-btn-green" id="cx-batch">批量</button><button class="p-btn p-btn-red" id="cx-clear">清缓存</button></div><div class="p-log" id="cx-log">等待执行...</div>';
        document.body.appendChild(panel);
        document.getElementById("cx-panel-close").onclick = function () { panel.remove(); };
        document.getElementById("cx-save-key").onclick = function () {
            var k = document.getElementById("cx-api-key").value.trim();
            if (!k) { log("Key 不能为空"); return; } setApiKey(k);
        };
        document.getElementById("cx-clear").onclick = function () { clearCache(); };

        document.getElementById("cx-single").onclick = async function () {
            log("----- 单题 -----");
            var list = getAllQuestionBlocks();
            if (list.length === 0) { log("未检测到题目"); return; }
            var q = list[0];
            log("题干: " + q.fullText.substring(0, 50) + "... qid=" + q.qid);
            var cache = getCache();
            if (cache[q.fullText]) { log("命中缓存: " + cache[q.fullText]); clickOptions(q, cache[q.fullText]); return; }
            try {
                var ans = await askAI(q.fullText);
                if (ans) { log("AI: " + ans); saveCache(q.fullText, ans); clickOptions(q, ans); } else log("无答案");
            } catch (e) { log("API错误: " + e.message); }
        };

        document.getElementById("cx-batch").onclick = async function () {
            log("============= 批量 =============");
            log("滚动加载中...");
            var step = window.innerHeight * 0.8;
            for (var s = 0; s < document.body.scrollHeight; s += step) { window.scrollTo(0, s); await sleep(200); }
            window.scrollTo(0, 0); await sleep(500);
            var list = getAllQuestionBlocks();
            if (list.length === 0) { log("未检测到题目"); return; }
            log("找到 " + list.length + " 题");
            var cache = getCache();
            for (var i = 0; i < list.length; i++) {
                var q = list[i];
                log("[" + (i+1) + "/" + list.length + "] qid=" + q.qid + " " + q.fullText.replace(/\s+/g," ").substring(0, 35) + "...");
                if (q.qid) {
                    var ansInput = document.getElementById("answer" + q.qid);
                    if (ansInput && ansInput.value !== "") { log("  已有答案: " + ansInput.value); continue; }
                }
                if (cache[q.fullText]) { log("  缓存: " + cache[q.fullText]); clickOptions(q, cache[q.fullText]); continue; }
                try {
                    var ans = await askAI(q.fullText);
                    if (ans) { log("  AI: " + ans); saveCache(q.fullText, ans); clickOptions(q, ans); } else log("  无答案");
                } catch (e) { log("  错: " + e.message); }
                if (i < list.length - 1) await sleep(1200);
            }
            log("============= 完成 =============");
            if (typeof saveWork === "function") { try { saveWork(); log("已调用 saveWork()"); } catch(e) { log("saveWork: " + e.message); } }
            else if (typeof top.saveWork === "function") { try { top.saveWork(); } catch(e) {} }
            else if (typeof saveAnswer === "function") { try { saveAnswer(); } catch(e) {} }
        };
    }

    function askAI(questionText) {
        var sysPrompt = "你是答题助手，严格执行：\n1. 单选仅输出1个大写字母(A/B/C/D)；\n2. 多选连续输出全部正确字母，无空格、标点、换行；\n3. 判断输出A(代表对/正确)或B(代表错/错误)；\n4. 禁止输出任何解析、解释、多余文字，只允许ABCD字符。";
        return fetch(VOLC_API_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", "Authorization": "Bearer " + getApiKey() },
            body: JSON.stringify({ model: VOLC_MODEL_ID, messages: [{ role: "system", content: sysPrompt }, { role: "user", content: questionText }], temperature: 0, max_tokens: 10, stream: false })
        }).then(function (r) {
            if (!r.ok) return r.json().then(function (d) { throw new Error((d.error && d.error.message) || ("HTTP " + r.status)); });
            return r.json();
        }).then(function (json) {
            var raw = json.choices && json.choices[0] && json.choices[0].message && json.choices[0].message.content;
            if (!raw) return "";
            var match = raw.toUpperCase().match(/[ABCD]/g);
            return match ? match.join("") : "";
        });
    }

    function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    var logDom = null;
    function log(msg) { if (!logDom) logDom = document.getElementById("cx-log"); if (logDom) { var t = new Date().toLocaleTimeString(); logDom.innerText += "[" + t + "] " + msg + "\n"; logDom.scrollTop = logDom.scrollHeight; } console.log(msg); }

    window.start = async function () { createPanel(); document.getElementById("cx-batch").click(); };
    window.clearAnswerCache = function () { clearCache(); };
    window.setVolcKey = function (key) { setApiKey(key); };
    window.showPanel = function () { createPanel(); };

    if (document.readyState === "complete" || document.readyState === "interactive") {
        setTimeout(function () { var qs = getAllQuestionBlocks(); if (qs.length > 0) { createPanel(); log("检测到 " + qs.length + " 题"); } else console.log("showPanel() 打开面板"); }, 1000);
    } else {
        document.addEventListener("DOMContentLoaded", function () { setTimeout(function () { var qs = getAllQuestionBlocks(); if (qs.length > 0) createPanel(); }, 1500); });
    }

    console.log("加载完成! 输入 start() / showPanel()");
    console.log("setVolcKey(key), clearAnswerCache()");
})();

