// ==UserScript==
// @name         集思录 REITs 选品助手 (v7.0 CN专用版)
// @namespace    http://tampermonkey.net/
// @version      7.0
// @description  增加 IRR 估算列（仅特许经营权类），优化筛选按钮位置。
// @author       万事通
// @match        *://www.jisilu.cn/data/cnreits/*
// @match        *://www.jisilu.cn/data/reits/*
// @match        *://www.jisilu.cn/web/reits/*
// @grant        GM_registerMenuCommand
// @grant        GM_addStyle
// @grant        GM_setClipboard
// ==/UserScript==

(function() {
    'use strict';

    console.log('>>> v7.0 CN版已启动');

    // === 全局状态 ===
    const STATE = {
        selectedTypes: new Set(), // 存储用户勾选的项目类型
        strictMode: true          // 默认开启严格筛选（过滤僵尸/高溢价）
    };

    // === 核心配置 ===
    const CONFIG = {
        minVolume: 500,      // 成交额 < 500万 -> 隐藏
        maxPremium: 20,      // 溢价率 > 20% -> 隐藏
        minYield: 5.0,       // 股息率 > 5% 且折价 -> 绿色
        safePremium: 0
    };

    // 特许经营权类关键词 (需要计算本金磨损)
    const FRANCHISE_TYPES = ['高速公路', '供热', '垃圾', '电厂', '风力', '光伏', '水电', '水利', '能源'];

    // 辅助工具：提取数字
    function getNumber(element) {
        if (!element) return null;
        let text = element.innerText.replace(/[%,\s]/g, '');
        let num = parseFloat(text);
        return isNaN(num) ? null : num;
    }

    // 筛选主逻辑 (isSilent: 是否静默执行，不弹窗)
    function runFilter(isSilent = false) {
        console.log('>>> 正在扫描数据行...');
        console.log('当前筛选类型集合:', Array.from(STATE.selectedTypes));
        
        // 仅针对目标表格的数据行进行操作
        let rows = document.querySelectorAll('#flex_CnReits tbody tr');
        let count = 0;
        let hiddenCount = 0;

        rows.forEach(row => {
            let volTd = row.querySelector('td[data-name="volume"]');
            let premTd = row.querySelector('td[data-name="premium_rt"]');
            let yieldTd = row.querySelector('td[data-name="dividend_ttm_rt"]');
            let typeTd = row.querySelector('td[data-name="project_type"]');

            if (!volTd || !premTd || !yieldTd) return; 

            let volume = getNumber(volTd);
            let premium = getNumber(premTd);
            let yieldRate = getNumber(yieldTd);
            // 确保移除可能存在的 &nbsp; 或多余空白
            let typeText = typeTd ? typeTd.innerText.replace(/\u00a0/g, ' ').trim() : '';

            // 样式重置 (先默认显示)
            row.style.display = ''; 
            row.style.backgroundColor = '';
            premTd.style.color = '';
            premTd.style.fontWeight = 'normal';
            yieldTd.style.color = '';
            yieldTd.style.fontWeight = 'normal';

            // 0. 类型过滤 (新增)
            if (STATE.selectedTypes.size > 0 && !STATE.selectedTypes.has(typeText)) {
                row.style.display = 'none';
                hiddenCount++;
                return;
            }

            // 1. 僵尸过滤 (仅在严格模式下生效)
            if (STATE.strictMode && volume !== null && volume < CONFIG.minVolume) {
                row.style.display = 'none';
                hiddenCount++;
                return;
            }

            // 2. 高溢价警报 (仅在严格模式下生效)
            if (STATE.strictMode && premium !== null && premium > CONFIG.maxPremium) {
                row.style.display = 'none';
                hiddenCount++;
                return;
            }

            // 3. 捡漏机会 (绿)
            if (premium !== null && yieldRate !== null) {
                if (premium < CONFIG.safePremium && yieldRate > CONFIG.minYield) {
                    row.style.backgroundColor = '#e8f5e9';
                    premTd.style.color = 'green';
                    premTd.style.fontWeight = 'bold';
                    yieldTd.style.color = 'green';
                    yieldTd.style.fontWeight = 'bold';
                }
            }
            count++;
        });

        console.log(`筛选完成：保留 ${count} 条，隐藏 ${hiddenCount} 条。`);
        if (!isSilent) {
            alert(`✅ 筛选成功！\n保留：${count} 只\n隐藏：${hiddenCount} 只 (僵尸/高溢价/类型不符)`);
        }
    }

    // === 类型筛选 UI ===
    function buildTypeFilterUI(container) {
        if (document.getElementById('type_filter_container')) return;

        // 1. 获取所有项目类型 (仅从目标表格中获取)
        const typeSet = new Set();
        document.querySelectorAll('#flex_CnReits tbody td[data-name="project_type"]').forEach(td => {
            const t = td.innerText.replace(/\u00a0/g, ' ').trim();
            if (t) typeSet.add(t);
        });
        const allTypes = Array.from(typeSet).sort();

        // 2. 构建 DOM
        const wrapper = document.createElement('span');
        wrapper.id = 'type_filter_container';
        wrapper.className = 'type-filter-container';
        
        wrapper.innerHTML = `
            <button class="type-filter-btn" id="btn_type_trigger">📂 类型筛选 ▼</button>
            <div class="type-dropdown" id="type_dropdown">
                <div class="type-dropdown-header">选择项目类型 (可多选)</div>
                <div class="type-list">
                    ${allTypes.map(t => `
                        <label class="type-option">
                            <input type="checkbox" value="${t}" ${STATE.selectedTypes.has(t) ? 'checked' : ''}>
                            ${t}
                        </label>
                    `).join('')}
                </div>
                <div class="type-dropdown-footer">
                    <label title="勾选后会自动隐藏成交额<500万或溢价率>20%的标的" style="float:left; font-size:12px; cursor:pointer; color:#666;">
                        <input type="checkbox" id="chk_strict_mode" checked> 严格初筛
                    </label>
                    <button id="btn_type_reset">重置</button>
                </div>
            </div>
        `;

        // 3. 事件绑定
        const triggerBtn = wrapper.querySelector('#btn_type_trigger');
        const dropdown = wrapper.querySelector('#type_dropdown');
        const checkboxes = wrapper.querySelectorAll('.type-list input[type="checkbox"]');
        const resetBtn = wrapper.querySelector('#btn_type_reset');
        const strictChk = wrapper.querySelector('#chk_strict_mode');

        // 切换显示
        triggerBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropdown.classList.toggle('show');
        };

        // 点击外部关闭
        document.addEventListener('click', (e) => {
            if (!wrapper.contains(e.target)) {
                dropdown.classList.remove('show');
            }
        });

        // 勾选逻辑
        checkboxes.forEach(chk => {
            chk.onchange = () => {
                if (chk.checked) {
                    STATE.selectedTypes.add(chk.value);
                } else {
                    STATE.selectedTypes.delete(chk.value);
                }
                triggerBtn.innerText = STATE.selectedTypes.size > 0 ? `📂 已选 (${STATE.selectedTypes.size})` : '📂 类型筛选 ▼';
                runFilter(true);
            };
        });

        // 严格模式切换
        strictChk.onchange = () => {
            STATE.strictMode = strictChk.checked;
            runFilter(true);
        };

        // 重置
        resetBtn.onclick = () => {
            STATE.selectedTypes.clear();
            STATE.strictMode = true; // 重置恢复严格模式
            
            checkboxes.forEach(c => c.checked = false);
            strictChk.checked = true;
            triggerBtn.innerText = '📂 类型筛选 ▼';
            
            runFilter(true);
            dropdown.classList.remove('show');
        };

        container.appendChild(wrapper);
    }

    // === 投资指南内容 (综合整理) ===
    const GUIDE_HTML = `
        <div class="guide-section">
            <h3>💡 核心理念</h3>
            <p><strong>REITs 不是股票，也不是理财。</strong> 它是资产证券化，买的是底层资产（高速、厂房、保租房）的未来现金流。不要看 K 线博弈，要看<strong>底层数据的确定性</strong>与<strong>估值的安全边际</strong>。</p>
        </div>

        <div class="guide-section">
            <h3>🛠️ 实战工具箱：三步选品漏斗</h3>
            <table class="guide-table">
                <tr>
                    <th style="width:20%">步骤</th>
                    <th style="width:30%">关注指标</th>
                    <th>操作标准</th>
                </tr>
                <tr>
                    <td><strong>1. 初筛</strong><br>(过滤垃圾)</td>
                    <td>成交额<br>分派率</td>
                    <td>
                        ❌ 剔除日成交额 < 500万的“僵尸”<br>
                        ✅ 产权类(保租房/园区) 分派率 > 4.5%<br>
                        ✅ 特许类(高速/能源) 分派率 > 7%
                    </td>
                </tr>
                <tr>
                    <td><strong>2. 估值</strong><br>(安全垫)</td>
                    <td>P/NAV (现价/净值)<br>折价率</td>
                    <td>
                        ✅ <strong>P/NAV < 1.0 (折价) 是核心安全垫</strong><br>
                        ⚠️ P/NAV > 1.2 (溢价20%) 除非极度稀缺，否则不碰
                    </td>
                </tr>
                <tr>
                    <td><strong>3. 验证</strong><br>(看财报)</td>
                    <td>运营数据<br>分红达成率</td>
                    <td>
                        🔍 <strong>高速/能源</strong>：看剩余年限(>10年)、车流量同比<br>
                        🔍 <strong>园区/仓储</strong>：看出租率(>90%)、大客户依赖<br>
                        🔍 <strong>达成率</strong>：可供分配金额达成率需 > 90%
                    </td>
                </tr>
            </table>
        </div>

        <div class="guide-section">
            <h3>📑 深度研报指南：像机构一样看公告</h3>
            <p style="font-size:12px; color:#666; margin-bottom:10px;">不要只看分红数字，去交易所官网下载原始PDF，重点检查以下“金矿”与“地雷”：</p>
            
            <h4 style="margin:8px 0 4px; color:#333;">1. 招股说明书 (IPO时看)</h4>
            <ul>
                <li><strong>资产属性 (生死攸关)</strong>：确认是“特许经营权”(到期归零) 还是 “产权”(可增值)。
                    <br><span style="color:#e65100;">👉 搜索关键词：“土地使用权终止日期”、“特许经营期限”</span></li>
                <li><strong>原始权益人</strong>：谁卖的资产？若是知名国企/央企，信用风险低；若是民企或债务暴雷企业，警惕其通过REITs“套现跑路”。</li>
                <li><strong>关联交易</strong>：大租户是不是“自己人”？如果前三大租户都是原始权益人的关联方，一旦母公司不续租，业绩将断崖下跌。</li>
            </ul>

            <h4 style="margin:8px 0 4px; color:#333;">2. 季度报告 (每3个月看)</h4>
            <ul>
                <li><strong>运营数据 (最真实)</strong>：
                    <br>🏭 <strong>园区/仓储</strong>：看<strong>“期末出租率”</strong>。环比下降 > 2% 就要警惕。看“租金单价”是否降价换量。
                    <br>🛣️ <strong>高速/能源</strong>：看<strong>“日均车流量”</strong>或“发电量”同比数据。同比下滑说明经济活力下降或路网分流。</li>
                <li><strong>可供分配金额 (分红钱袋子)</strong>：
                    <br>计算公式：<code>本期累计金额 / 招募书预测同期金额</code>。
                    <br><span style="color:#d32f2f;">🚨 红线：达成率 < 90% 且无合理解释（如季节性因素），直接卖出。</span></li>
            </ul>

            <h4 style="margin:8px 0 4px; color:#333;">3. 年度报告 (每年4月看)</h4>
            <ul>
                <li><strong>主要财务指标</strong>：关注 <strong>EBITDA (息税折旧摊销前利润)</strong>，这是比净利润更准确反映现金流能力的指标。</li>
                <li><strong>费用端异动</strong>：检查“运营管理费”和“财务费用”。如果收入没涨，管理费大涨，说明管理层在吸血。</li>
                <li><strong>资产估值报告</strong>：查看评估机构对底层资产的最新估值参数（折现率、租金增长率假设）。如果假设过于乐观（如预测租金年涨5%但实际在跌），说明净值虚高。</li>
            </ul>
        </div>

        <div class="guide-section">
            <h3>🚩 避坑指南 (Red Flags)</h3>
            <ul>
                <li><strong>特许经营权类（高速、环保）：</strong> 警惕 <strong>剩余年限 < 10年</strong>。若到期归零，高分红里其实包含本金退还。</li>
                <li><strong>产权类（园区、仓储）：</strong> 警惕 <strong>P/NAV > 1.2</strong>。高溢价会透支未来分红。警惕 <strong>单一租户占比 > 30%</strong>。</li>
                <li><strong>流动性陷阱：</strong> 坚决不碰日均成交额 < 300万的标的，想卖卖不掉。</li>
            </ul>
        </div>

        <div class="guide-section">
            <h3>🍰 “现金奶牛”组合策略</h3>
            <ul>
                <li><strong>50% 底仓（特许类）：</strong> 高速、能源。追求高分红、现金流稳定。优先选核心枢纽、折价率适中。</li>
                <li><strong>30% 压舱石（产权类）：</strong> 保租房、核心消费。抗通胀，租金有上涨潜力。</li>
                <li><strong>20% 动态轮动：</strong> 仓储、厂房。利用市场情绪错杀（折价过大）时买入，估值修复后轮动。</li>
            </ul>
        </div>
        
        <div class="guide-section">
            <h3>📅 复盘清单</h3>
            <p><strong>每日：</strong> 扫视折价率（是否有错杀）、成交额（流动性是否枯竭）。<br>
            <strong>每周：</strong> 检查是否有解禁公告、分红公告。<br>
            <strong>每季：</strong> 核对季报出租率/车流量是否恶化。</p>
        </div>
    `;

    // === CSS 样式注入 ===
    function addGlobalStyle() {
        const css = `
            .reit-modal-overlay {
                position: fixed; top: 0; left: 0; width: 100%; height: 100%;
                background: rgba(0, 0, 0, 0.5); z-index: 99999;
                display: flex; justify-content: center; align-items: center;
                backdrop-filter: blur(2px);
            }
            .reit-modal-content {
                background: white; width: 800px; max-width: 90%; max-height: 85vh;
                border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.2);
                display: flex; flex-direction: column; overflow: hidden;
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
            }
            .reit-modal-header {
                padding: 15px 20px; border-bottom: 1px solid #eee; background: #f8f9fa;
                display: flex; justify-content: space-between; align-items: center;
            }
            .reit-modal-title { font-size: 18px; font-weight: bold; color: #333; margin: 0; }
            .reit-modal-close { cursor: pointer; font-size: 24px; color: #999; border: none; background: none; }
            .reit-modal-close:hover { color: #333; }
            .reit-modal-body { padding: 20px; overflow-y: auto; color: #444; line-height: 1.6; }
            
            .guide-section { margin-bottom: 20px; padding-bottom: 15px; border-bottom: 1px dashed #eee; }
            .guide-section:last-child { border-bottom: none; }
            .guide-section h3 { font-size: 16px; color: #009688; margin-top: 0; margin-bottom: 10px; border-left: 4px solid #009688; padding-left: 10px; }
            .guide-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 10px; }
            .guide-table th, .guide-table td { border: 1px solid #e0e0e0; padding: 8px; text-align: left; vertical-align: top; }
            .guide-table th { background: #f0f7f6; color: #00695c; font-weight: 600; }
            .guide-section ul { margin: 5px 0; padding-left: 20px; }
            .guide-section li { margin-bottom: 5px; }

            /* 类型筛选下拉菜单 CSS */
            .type-filter-container { position: relative; display: inline-block; margin-left: 8px; vertical-align: middle; z-index: 9999; }
            .type-filter-btn { cursor: pointer; padding: 2px 8px; font-size: 12px; background: #fff; color: #333; border: 1px solid #ccc; border-radius: 4px; }
            .type-dropdown {
                display: none; position: absolute; top: 100%; left: 0; margin-top: 4px;
                background: white; border: 1px solid #ccc; border-radius: 4px;
                padding: 10px; z-index: 999999; min-width: 180px;
                box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            }
            .type-dropdown.show { display: block; }
            .type-dropdown-header { font-size: 12px; font-weight: bold; color: #666; margin-bottom: 8px; padding-bottom: 4px; border-bottom: 1px solid #eee; }
            .type-list { max-height: 250px; overflow-y: auto; }
            .type-option { display: block; margin-bottom: 6px; cursor: pointer; font-size: 13px; color: #333; white-space: nowrap; }
            .type-option input { margin-right: 6px; vertical-align: middle; }
            .type-option:hover { background-color: #f5f5f5; }
            .type-dropdown-footer { margin-top: 8px; padding-top: 6px; border-top: 1px solid #eee; text-align: right; }
            #btn_type_reset { font-size: 12px; padding: 2px 6px; cursor: pointer; }
        `;
        const style = document.createElement('style');
        style.type = 'text/css';
        style.innerHTML = css;
        document.head.appendChild(style);
    }

    // === 弹窗逻辑 ===
    function showGuideModal() {
        if (document.getElementById('reit_guide_modal')) return;

        const overlay = document.createElement('div');
        overlay.id = 'reit_guide_modal';
        overlay.className = 'reit-modal-overlay';
        
        overlay.innerHTML = `
            <div class="reit-modal-content">
                <div class="reit-modal-header">
                    <h2 class="reit-modal-title">📘 公募 REITs 实战投资指南</h2>
                    <button class="reit-modal-close">×</button>
                </div>
                <div class="reit-modal-body">
                    ${GUIDE_HTML}
                </div>
            </div>
        `;

        // 关闭事件
        overlay.querySelector('.reit-modal-close').onclick = () => overlay.remove();
        overlay.onclick = (e) => {
            if (e.target === overlay) overlay.remove();
        };

        document.body.appendChild(overlay);
    }

    // 初始化样式
    addGlobalStyle();

    // === 通用数值排序逻辑 ===
    function sortTableGeneric(thElement, cellSelector) {
        const table = document.getElementById('flex_CnReits');
        const tbody = table.querySelector('tbody');
        const rows = Array.from(tbody.querySelectorAll('tr'));
        
        // 获取当前排序状态
        let currentSort = thElement.dataset.sort || 'default';
        let newSort = currentSort === 'desc' ? 'asc' : 'desc'; 

        // 重置所有自定义表头的箭头
        table.querySelectorAll('.custom-header-sort').forEach(th => {
            th.innerText = th.innerText.replace(/[⬆⬇]/g, '⇵');
            th.dataset.sort = '';
        });

        // 更新当前表头 UI
        thElement.dataset.sort = newSort;
        thElement.innerText = thElement.innerText.replace('⇵', newSort === 'asc' ? '⬆' : '⬇');

        // 提取数值并排序
        rows.sort((rowA, rowB) => {
            const getVal = (row) => {
                const cell = row.querySelector(cellSelector);
                if (!cell || cell.innerText === '-' || cell.innerText === '') return -999999; 
                return parseFloat(cell.innerText.replace(/[%,\s]/g, ''));
            };

            const valA = getVal(rowA);
            const valB = getVal(rowB);

            if (newSort === 'desc') {
                return valB - valA;
            } else {
                return valA - valB;
            }
        });

        // 重新插入 DOM
        rows.forEach(row => tbody.appendChild(row));
    }

    // === 核心：注入自定义列 (IRR & 性价比) ===
    function updateCustomColumns() {
        const table = document.getElementById('flex_CnReits');
        if (!table) return;

        // 1. 处理表头
        const headerRow = table.querySelector('thead tr:last-child');
        if (headerRow) {
            // 隐藏“全称”列头
            const fullNmTh = Array.from(headerRow.querySelectorAll('th')).find(th => th.innerText.includes('全称'));
            if (fullNmTh) fullNmTh.style.display = 'none';

            // 注入自定义表头
            const premiumTh = headerRow.querySelector('th[data-name="premium_rt"]') || headerRow.children[7];
            
            // --- 插入 IRR 表头 ---
            if (premiumTh && !headerRow.querySelector('.custom-irr-header')) {
                const irrTh = document.createElement('th');
                irrTh.className = 'header custom-irr-header custom-header-sort';
                irrTh.style.width = '70px';
                irrTh.style.cursor = 'pointer';
                irrTh.innerText = 'IRR(估) ⇵';
                irrTh.title = '点击排序\n老手速算 IRR = 股息率 - (100 / 剩余年限)\n仅适用于特许经营权类';
                irrTh.style.backgroundColor = '#fff3e0'; 
                irrTh.onclick = () => sortTableGeneric(irrTh, '.custom-irr-cell');
                premiumTh.parentNode.insertBefore(irrTh, premiumTh.nextSibling);
            }

            // --- 插入 性价比 表头 ---
            const irrTh = headerRow.querySelector('.custom-irr-header');
            if (irrTh && !headerRow.querySelector('.custom-score-header')) {
                const scoreTh = document.createElement('th');
                scoreTh.className = 'header custom-score-header custom-header-sort';
                scoreTh.style.width = '70px';
                scoreTh.style.cursor = 'pointer';
                scoreTh.innerText = '性价比 ⇵';
                scoreTh.title = '点击排序\n综合得分 = 股息率 - 溢价率\n(即：股息率 + 折价率)\n分数越高越好';
                scoreTh.style.backgroundColor = '#e8f5e9'; 
                scoreTh.onclick = () => sortTableGeneric(scoreTh, '.custom-score-cell');
                irrTh.parentNode.insertBefore(scoreTh, irrTh.nextSibling);
            }
        }

        // 2. 处理数据行
        const bodyRows = table.querySelectorAll('tbody tr');
        bodyRows.forEach(row => {
            // 隐藏“全称”单元格
            const fullNmTd = row.querySelector('td[data-name="full_nm"]');
            if (fullNmTd) fullNmTd.style.display = 'none';

            // --- 晨星链接替换逻辑 ---
            const fundIdTd = row.querySelector('td[data-name="fund_id"]');
            const urlTd = row.querySelector('td[data-name="urls"]');
            const nameTd = row.querySelector('td[data-name="fund_nm"]');

            if (fundIdTd && urlTd) {
                const fundId = fundIdTd.innerText.trim();
                
                // 1. 晨星链接
                const aUrl = urlTd.querySelector('a');
                if (aUrl && !aUrl.dataset.urlProcessed) {
                    aUrl.href = `https://www.morningstar.cn/#/fund/${fundId}`;
                    aUrl.dataset.urlProcessed = "true";
                    aUrl.title = '晨星(Morningstar) 基金详情';
                }

                // 2. 东方财富行情链接 (简称列)
                if (nameTd && !nameTd.dataset.linkAdded) {
                    const nameText = nameTd.innerText.trim();
                    const market = fundId.startsWith('5') ? 'sh' : 'sz';
                    const emLink = `https://quote.eastmoney.com/${market}${fundId}.html`;
                    const reportLink = `https://fundf10.eastmoney.com/jjgg_${fundId}_3.html`;
                    
                    nameTd.innerHTML = `
                        <a href="${emLink}" target="_blank" style="color: inherit; text-decoration: none; border-bottom: 1px dashed #999;" title="查看东方财富价格走势">${nameText}</a>
                        <a href="${reportLink}" target="_blank" style="margin-left: 4px; font-size: 12px; color: #999; text-decoration: none;" title="查看基金公告/财报">[财报]</a>
                    `;
                    nameTd.dataset.linkAdded = "true";
                }
            }

            // 避免重复插入自定义列
            if (row.querySelector('.custom-irr-cell')) return;

            const premiumTd = row.querySelector('td[data-name="premium_rt"]');
            const yieldTd = row.querySelector('td[data-name="dividend_ttm_rt"]');
            const yearTd = row.querySelector('td[data-name="left_year"]');
            const typeTd = row.querySelector('td[data-name="project_type"]');

            if (premiumTd && yieldTd && yearTd && typeTd) {
                // 获取基础数据
                const yieldVal = getNumber(yieldTd);
                const premiumVal = getNumber(premiumTd);
                const yearVal = getNumber(yearTd);
                const typeText = typeTd.innerText.trim();
                const isFranchise = FRANCHISE_TYPES.some(t => typeText.includes(t));

                // --- 计算 IRR ---
                const irrTd = document.createElement('td');
                irrTd.className = 'custom-irr-cell';
                irrTd.style.textAlign = 'right';
                
                if (isFranchise && yieldVal && yearVal > 0) {
                    const irr = yieldVal - (100 / yearVal);
                    irrTd.innerText = irr.toFixed(2) + '%';
                    irrTd.title = `估算逻辑: ${yieldVal}% - (100 / ${yearVal}年)`;
                    if (irr < 3.5) irrTd.style.color = '#ef5350';
                    else if (irr > 6) irrTd.style.color = '#2e7d32';
                    else irrTd.style.color = '#f57f17';
                } else {
                    irrTd.innerText = '-';
                    irrTd.style.color = '#ccc';
                }
                premiumTd.parentNode.insertBefore(irrTd, premiumTd.nextSibling);

                // --- 计算 性价比得分 ---
                const scoreTd = document.createElement('td');
                scoreTd.className = 'custom-score-cell';
                scoreTd.style.textAlign = 'right';
                scoreTd.style.fontWeight = 'bold';

                if (yieldVal !== null && premiumVal !== null) {
                    // 公式：股息 - 溢价 (相当于 股息 + 折价)
                    const score = yieldVal - premiumVal;
                    scoreTd.innerText = score.toFixed(2);
                    
                    // 颜色阶梯
                    if (score > 20) {
                        scoreTd.style.color = '#1b5e20'; // 深绿 (极好)
                        scoreTd.style.backgroundColor = '#c8e6c9';
                    } else if (score > 10) {
                        scoreTd.style.color = '#2e7d32'; // 绿 (好)
                    } else if (score < 0) {
                        scoreTd.style.color = '#c62828'; // 红 (差)
                    } else {
                        scoreTd.style.color = '#333'; // 普通
                    }
                } else {
                    scoreTd.innerText = '-';
                }
                irrTd.parentNode.insertBefore(scoreTd, irrTd.nextSibling);
            }
        });
    }

    // === 导出 Markdown 功能 ===
    function getCleanText(cell) {
        if (!cell) return '';
        // 获取纯文本，移除多余空白
        let text = cell.innerText.replace(/\s+/g, ' ').trim();
        // 去除脚本添加的 "[财报]" 后缀 (针对名称列的特殊处理，保持数据纯净)
        text = text.replace(/\[财报\]$/, '').trim();
        // 转义 Markdown 表格中的关键字符 |
        return text.replace(/\|/g, '\\|');
    }

    function generateMarkdown() {
        const table = document.getElementById('flex_CnReits');
        if (!table) return null;

        // 1. 获取表头 (仅导出可见列)
        const headerRow = table.querySelector('thead tr:last-child');
        const headers = Array.from(headerRow.children)
            .filter(th => th.style.display !== 'none')
            .map(th => getCleanText(th));

        // 2. 构建分割线
        const separator = headers.map(() => '---');

        // 3. 获取数据行 (仅导出可见行、可见列)
        const rows = Array.from(table.querySelectorAll('tbody tr'))
            .filter(tr => tr.style.display !== 'none')
            .map(tr => {
                return Array.from(tr.children)
                    .filter(td => td.style.display !== 'none')
                    .map(td => getCleanText(td));
            });

        // 4. 拼接 Markdown
        const lines = [];
        lines.push(`| ${headers.join(' | ')} |`);
        lines.push(`| ${separator.join(' | ')} |`);
        rows.forEach(row => {
            lines.push(`| ${row.join(' | ')} |`);
        });

        // 添加导出时间和来源信息
        const meta = `> 数据来源：集思录 REITs\n> 导出时间：${new Date().toLocaleString()}\n\n`;
        
        return meta + lines.join('\n');
    }

    function handleExport(type) {
        const md = generateMarkdown();
        if (!md) {
            alert('未找到表格数据！');
            return;
        }

        if (type === 'clipboard') {
            GM_setClipboard(md);
            alert('✅ 表格已复制到剪贴板 (Markdown格式)');
        } else if (type === 'file') {
            const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `jisilu_reits_export_${new Date().toISOString().slice(0,10)}.md`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }
    }

    // === UI 注入 ===
    function injectUI() {
        // 1. 注入筛选按钮
        const titleTd = document.querySelector('td.title');
        if (titleTd && !document.getElementById('btn_reit_filter')) {
            const btn = document.createElement('span'); // 使用 span 模拟按钮或者直接插入 button
            btn.id = 'btn_reit_filter';
            btn.innerHTML = '<button style="margin-left: 15px; cursor: pointer; padding: 2px 8px; font-size: 12px; background: #009688; color: white; border: none; border-radius: 4px;">🔍 筛选</button>';
            
            // Tooltip
            btn.title = `点击执行筛选：\n1. 隐藏成交额 < ${CONFIG.minVolume}万\n2. 隐藏溢价率 > ${CONFIG.maxPremium}%\n3. 标绿高股息折价品种`;
            
            btn.onclick = (e) => {
                e.preventDefault(); // 防止触发表格排序等其他事件
                runFilter();
            };

            // 插入到 "刷新" 链接后面
            const refreshLink = titleTd.querySelector('a');
            if (refreshLink) {
                refreshLink.parentNode.insertBefore(btn, refreshLink.nextSibling);
            } else {
                titleTd.appendChild(btn);
            }
        }

        // 1.5 注入指南按钮
        if (titleTd && !document.getElementById('btn_reit_guide')) {
            const btnGuide = document.createElement('span');
            btnGuide.id = 'btn_reit_guide';
            btnGuide.innerHTML = '<button style="margin-left: 8px; cursor: pointer; padding: 2px 8px; font-size: 12px; background: #2196f3; color: white; border: none; border-radius: 4px;">📘 指南</button>';
            btnGuide.title = '点击查看公募 REITs 实战投资指南';
            btnGuide.onclick = (e) => {
                e.preventDefault();
                showGuideModal();
            };

            // 插入到筛选按钮后面
            const filterBtn = document.getElementById('btn_reit_filter');
            if (filterBtn) {
                filterBtn.parentNode.insertBefore(btnGuide, filterBtn.nextSibling);
            }
        }

        // 1.7 注入导出按钮 (新增)
        if (titleTd && !document.getElementById('btn_reit_export_group')) {
            const span = document.createElement('span');
            span.id = 'btn_reit_export_group';
            span.style.marginLeft = '8px';
            
            // 复制按钮
            const btnCopy = document.createElement('button');
            btnCopy.innerText = '📋 复制MD';
            btnCopy.style.cssText = 'cursor: pointer; padding: 2px 8px; font-size: 12px; background: #ff9800; color: white; border: none; border-radius: 4px; margin-right: 4px;';
            btnCopy.title = '复制可见表格数据到剪贴板 (Markdown格式)';
            btnCopy.onclick = (e) => { e.preventDefault(); handleExport('clipboard'); };

            // 下载按钮
            const btnDown = document.createElement('button');
            btnDown.innerText = '📥 导出MD';
            btnDown.style.cssText = 'cursor: pointer; padding: 2px 8px; font-size: 12px; background: #795548; color: white; border: none; border-radius: 4px;';
            btnDown.title = '下载可见表格数据为 .md 文件';
            btnDown.onclick = (e) => { e.preventDefault(); handleExport('file'); };

            span.appendChild(btnCopy);
            span.appendChild(btnDown);

            const guideBtn = document.getElementById('btn_reit_guide');
            if (guideBtn) {
                guideBtn.parentNode.insertBefore(span, guideBtn.nextSibling);
            }
        }

        // 1.6 注入类型筛选下拉 (新增)
        const filterBtn = document.getElementById('btn_reit_filter');
        if (titleTd && !document.getElementById('type_filter_container') && filterBtn) {
            buildTypeFilterUI(filterBtn.parentNode);
        }

        // 2. 更新自定义列数据 (IRR & 性价比)
        updateCustomColumns();
    }

    // 启动循环检查 (应对表格排序、翻页等动态加载)
    setInterval(() => {
        injectUI();
    }, 1000);

    // 注册菜单命令
    GM_registerMenuCommand("🚀 立即筛选", runFilter);

})();