// XỬ LÝ LOGIC ĐĂNG NHẬP (Cửa ải bảo vệ)
        const ADMIN_PASS = "admin"; // <--- Đổi mật khẩu của bạn tại đây
        const loginOverlay = document.getElementById('loginOverlay');
        const loginForm = document.getElementById('loginForm');
        const passInput = document.getElementById('adminPassword');
        const loginError = document.getElementById('loginError');

        // Kiểm tra xem đã đăng nhập trước đó chưa
        if (localStorage.getItem('apex_logged_in') === 'true') {
            loginOverlay.style.display = 'none';
        }

        loginForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (passInput.value === ADMIN_PASS) {
                localStorage.setItem('apex_logged_in', 'true');
                loginOverlay.style.opacity = '0';
                setTimeout(() => { loginOverlay.style.display = 'none'; }, 300);
            } else {
                loginError.style.display = 'block';
                passInput.style.border = '1px solid #ef4444';
            }
        });

        document.getElementById('logoutBtn').addEventListener('click', (e) => {
            e.preventDefault();
            localStorage.removeItem('apex_logged_in');
            location.reload(); // F5 lại web, màn hình đăng nhập sẽ tự động hiện ra
        });

        import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
        import { getFirestore, collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, orderBy } 
        from "https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js";
        import { ENV } from './env.js';

        const firebaseConfig = {
            apiKey: ENV.FIREBASE_API_KEY,
            authDomain: "badminton-30d4a.firebaseapp.com",
            projectId: "badminton-30d4a",
            storageBucket: "badminton-30d4a.firebasestorage.app",
            messagingSenderId: "726320804555",
            appId: "1:726320804555:web:22098767904e5ab680614e",
            measurementId: "G-FP6WK9SHY9"
            };

        const app = initializeApp(firebaseConfig);
        const db = getFirestore(app);
        const bookingsCollection = collection(db, "bookings");
        const requestsCollection = collection(db, "requests");

        const tbody = document.getElementById('bookingTbody');
        const reqList = document.getElementById('requestList');
        const notifBadge = document.getElementById('notificationBadge');
        
        const dateFilterInput = document.getElementById('dashboardDateFilter');
        const calendarDateInput = document.getElementById('calendarDateFilter');
        
        let unreadNotifs = 0;
        let globalRawDocs = []; 
        let globalGroupedBookings = {};
        let myRevenueChart = null; 

        const today = new Date();
        const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        dateFilterInput.value = todayStr;
        calendarDateInput.value = todayStr;

        dateFilterInput.addEventListener('change', () => { renderAllViews(); });
        calendarDateInput.addEventListener('change', () => { renderTimelineView(); });

        function formatMoney(amount) { return amount.toLocaleString('vi-VN') + ' VNĐ'; }
        
        function getRawIntegerPrice(priceInput) {
            if (!priceInput) return 0;
            let cleanedString = String(priceInput).replace(/[^\d]/g, '');
            let parsedNumber = parseInt(cleanedString);
            if (isNaN(parsedNumber)) return 0;
            if (parsedNumber > 0 && parsedNumber < 10000) return parsedNumber * 1000;
            return parsedNumber || 0;
        }

        function formatTimeDisplay(timesArray) {
            if (!timesArray || timesArray.length === 0) return "Chưa rõ giờ";
            let validTimes = timesArray.filter(t => t && String(t).trim() !== "" && t !== "Giờ tự do");
            if (validTimes.length === 0) return "Giờ tự do";

            let range = validTimes.find(t => String(t).includes('-') || String(t).includes('đến'));
            if (range) return range;

            let hours = [];
            validTimes.forEach(t => {
                let match = String(t).match(/^(\d{1,2}):\d{2}/);
                if (match) {
                    let h = parseInt(match[1]);
                    if (h >= 5 && h <= 20) hours.push(h); 
                }
            });

            if (hours.length === 0) return validTimes.join(', ');

            hours = [...new Set(hours)].sort((a, b) => a - b);
            let result = [];
            let start = hours[0];
            let prev = hours[0];

            for (let i = 1; i < hours.length; i++) {
                let curr = hours[i];
                if (curr !== prev + 1) {
                    result.push(`${String(start).padStart(2, '0')}:00 - ${String(prev + 1).padStart(2, '0')}:00`);
                    start = curr;
                }
                prev = curr;
            }
            let endHour = prev + 1;
            if (endHour > 21) endHour = 21; 
            result.push(`${String(start).padStart(2, '0')}:00 - ${String(endHour).padStart(2, '0')}:00`);
            return result.join(" & ");
        }

        function parseBookingsData() {
            globalGroupedBookings = {};
            let customers = {};

            globalRawDocs.forEach((firebaseDoc) => {
                const data = firebaseDoc.data();
                const docId = firebaseDoc.id;

                const bCode = data.bookingCode || data.id || ("#APX-" + docId.substring(0,4).toUpperCase());
                const cName = data.customerName || data.name || data.tenKhachHang || data.khach || "Khách vãng lai";
                const court = data.court || data.san || data.tenSan || "Sân chưa rõ";
                const status = data.status || data.trangThai || "Chưa thanh toán";
                
                let time = data.timeSlot || data.khungGio || data.thoiGian || data.time || data.gioDat || "Giờ tự do";
                let rawPrice = data.price || data.totalPrice || data.tongTien || data.amount || data.tien || 0;
                let extraServices = data.extraServices || [];

                for (let key in data) {
                    let valStr = String(data[key]).toLowerCase();
                    let keyStr = String(key).toLowerCase();
                    if (time === "Giờ tự do" && !keyStr.includes('create') && !keyStr.includes('date')) {
                        if (valStr.includes(':00') || valStr.includes(' - ') || valStr.includes('đến')) time = data[key];
                    }
                }

                if (!rawPrice || getRawIntegerPrice(rawPrice) === 0) {
                    for (let key in data) {
                        let valStr = String(data[key]).toLowerCase();
                        let keyStr = String(key).toLowerCase();
                        if (keyStr.includes('phone') || keyStr.includes('date') || keyStr.includes('create')) continue;
                        if (keyStr.includes('tien') || keyStr.includes('price') || valStr.includes('vnđ') || valStr.includes('vnd')) {
                            let tempPrice = getRawIntegerPrice(data[key]);
                            if (tempPrice >= 10000) { rawPrice = tempPrice; break; }
                        }
                    }
                }

                let cleanPrice = getRawIntegerPrice(rawPrice);
                
                let createdAtDate = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date()) : new Date();
                let docDateYMD = createdAtDate.getFullYear() + '-' + String(createdAtDate.getMonth() + 1).padStart(2, '0') + '-' + String(createdAtDate.getDate()).padStart(2, '0');
                
                let groupHours = new Set();
                let str = String(time).toLowerCase();
                let rangeMatch = str.match(/(\d{1,2})(?::\d{2}|h|g).*?(?:-|đến|den).*?(\d{1,2})(?::\d{2}|h|g)/);
                if (rangeMatch) {
                    let s = parseInt(rangeMatch[1]);
                    let e = parseInt(rangeMatch[2]);
                    if (s >= 5 && s <= 20 && e > s) { for(let h = s; h < e; h++) groupHours.add(h); }
                } else {
                    let singleMatch = str.match(/(\d{1,2})(?::\d{2}|h|g)/);
                    if (singleMatch) {
                        let h = parseInt(singleMatch[1]);
                        if (h >= 5 && h <= 20) groupHours.add(h);
                    }
                }

                // 🔥 THUẬT TOÁN TÍNH GIÁ ĐỘNG MỚI (ĐỒNG GIÁ 4 SÂN & FLASH SALE) 🔥
                if (cleanPrice === 0) {
                    let calculatedBasePrice = 0;
                    let minHour = 24;
                    groupHours.forEach(h => {
                        // >= 17h tính 120k, còn lại 80k
                        calculatedBasePrice += (h >= 17) ? 120000 : 80000;
                        if (h < minHour) minHour = h;
                    });

                    // Kiểm tra Flash Sale (Chỉ áp dụng khi đặt cách giờ chơi từ 30 -> 60 phút)
                    if (minHour < 24) {
                        let createdMinutes = createdAtDate.getHours() * 60 + createdAtDate.getMinutes();
                        let startMinutes = minHour * 60;
                        let diff = startMinutes - createdMinutes;
                        
                        if (diff >= 30 && diff <= 60) {
                            calculatedBasePrice = calculatedBasePrice * 0.7; // Giảm 30%
                        }
                    }
                    cleanPrice = calculatedBasePrice > 0 ? calculatedBasePrice : 80000;
                }

                const groupKey = `${cName}_${court}_${status}_${docDateYMD}`;

                if (!globalGroupedBookings[groupKey]) {
                    globalGroupedBookings[groupKey] = { 
                        docIds: [docId], bookingCode: bCode, customerName: cName, court: court, 
                        totalPrice: cleanPrice, status: status, times: [time],
                        hasRealPrice: rawPrice > 0, services: [...extraServices], dateYMD: docDateYMD,
                        parsedHours: Array.from(groupHours)
                    };
                } else {
                    globalGroupedBookings[groupKey].docIds.push(docId); 
                    if (rawPrice > 0) {
                        if (!globalGroupedBookings[groupKey].hasRealPrice) {
                            globalGroupedBookings[groupKey].totalPrice = cleanPrice;
                            globalGroupedBookings[groupKey].hasRealPrice = true;
                        } else { globalGroupedBookings[groupKey].totalPrice += cleanPrice; }
                    } else if (!globalGroupedBookings[groupKey].hasRealPrice) {
                        globalGroupedBookings[groupKey].totalPrice += cleanPrice;
                    }
                    if (!globalGroupedBookings[groupKey].times.includes(time)) globalGroupedBookings[groupKey].times.push(time); 
                    if (extraServices.length > 0) globalGroupedBookings[groupKey].services.push(...extraServices);
                    Array.from(groupHours).forEach(h => globalGroupedBookings[groupKey].parsedHours.push(h));
                }

                if(!customers[cName]) customers[cName] = { count: 1, totalSpent: cleanPrice };
                else {
                    customers[cName].count += 1;
                    if (!globalGroupedBookings[groupKey].hasRealPrice) customers[cName].totalSpent += cleanPrice;
                }
            });
            
            const customerTbody = document.getElementById('customerTbody');
            customerTbody.innerHTML = "";
            Object.keys(customers).forEach(key => {
                const c = customers[key];
                let rank = c.totalSpent > 1000000 ? "VIP" : "Tiêu chuẩn";
                let rankColor = c.totalSpent > 1000000 ? "color: var(--warning); font-weight:bold;" : "color: var(--text-muted);";
                customerTbody.innerHTML += `
                    <tr>
                        <td><div class="customer-cell"><div class="avatar-sm bg-blue">${key.charAt(0).toUpperCase()}</div><div class="customer-name">${key}</div></div></td>
                        <td style="text-align:center;">${c.count} lần</td>
                        <td class="amount">${formatMoney(c.totalSpent)}</td>
                        <td style="text-align:center; ${rankColor}">${rank}</td>
                    </tr>
                `;
            });
        }

        function renderDashboardView() {
            tbody.innerHTML = ""; 
            let visibleCount = 0;
            let selectedDateStr = dateFilterInput.value;

            Object.values(globalGroupedBookings).forEach(group => {
                if (group.dateYMD === selectedDateStr || selectedDateStr === "") {
                    visibleCount++;
                    let statusClass = group.status === "Đã thanh toán" ? "status-paid" : "status-pending";
                    let statusColor = group.status === "Mới" ? "background-color:#eff6ff; color:#3b82f6;" : "";
                    let displayTime = formatTimeDisplay(group.times);

                    const tr = document.createElement('tr');
                    tr.setAttribute('data-id', group.docIds.join(',')); 
                    tr.setAttribute('data-price', group.totalPrice);
                    tr.setAttribute('data-court', group.court);
                    tr.setAttribute('data-time', displayTime);
                    tr.setAttribute('data-services', group.services.join('|||'));
                    tr.setAttribute('data-raw-name', group.customerName); 

                    tr.innerHTML = `
                        <td class="booking-id" style="font-size:0.85rem !important;">${group.bookingCode}</td>
                        <td>
                            <div class="customer-cell">
                                <div class="avatar-sm bg-orange">${group.customerName.charAt(0).toUpperCase()}</div>
                                <div class="customer-name">${group.customerName}</div>
                            </div>
                        </td>
                        <td><strong>${group.court}</strong><div class="booking-time-muted">${displayTime}</div></td>
                        <td><div class="status-badge ${statusClass}" style="${statusColor}">${group.status}</div></td>
                        <td class="amount">${formatMoney(group.totalPrice)}</td>
                        <td><button type="button" class="icon-action-btn action-dots"><i class='bx bx-dots-vertical-rounded'></i></button></td>
                    `;
                    tbody.appendChild(tr);
                }
            });

            if (visibleCount === 0) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Không có lịch đặt sân nào trong ngày này.</td></tr>';
            
            let totalRevenue = 0; let totalPending = 0;
            document.querySelectorAll('#bookingTbody tr:not(.fade-out)').forEach(row => {
                if(row.querySelector('.status-badge')) {
                    const status = row.querySelector('.status-badge').innerText.trim();
                    const price = parseInt(row.getAttribute('data-price')) || 0;
                    if (status === "Đã thanh toán") totalRevenue += price; else totalPending += 1;
                }
            });
            document.getElementById('statTotalBookings').innerText = visibleCount;
            document.getElementById('statRevenue').innerText = formatMoney(totalRevenue);
            document.getElementById('statPending').innerText = totalPending;
            document.getElementById('statOccupancy').innerText = (visibleCount > 0 ? Math.min(Math.round((visibleCount / 64) * 100), 100) : 0) + '%';
            
            attachMenuEvent();
            renderRevenueChart(); 
        }

        function renderRevenueChart() {
            const ctx = document.getElementById('revenueChart');
            if (!ctx) return;

            const labels = [];
            const dataArray = [0, 0, 0, 0, 0, 0, 0];
            const dateMap = {}; 

            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                const ymd = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
                const displayDate = String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0');
                labels.push(displayDate);
                dateMap[ymd] = 6 - i; 
            }

            Object.values(globalGroupedBookings).forEach(group => {
                if (group.status === "Đã thanh toán" && dateMap[group.dateYMD] !== undefined) {
                    dataArray[dateMap[group.dateYMD]] += group.totalPrice;
                }
            });

            if (myRevenueChart) {
                myRevenueChart.data.labels = labels;
                myRevenueChart.data.datasets[0].data = dataArray;
                myRevenueChart.update();
            } else {
                myRevenueChart = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Doanh thu (VNĐ)',
                            data: dataArray,
                            borderColor: '#10b981',
                            backgroundColor: 'rgba(16, 185, 129, 0.1)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#10b981',
                            pointBorderColor: '#ffffff',
                            pointRadius: 5,
                            pointHoverRadius: 7
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: { callbacks: { label: function(context) { return context.parsed.y.toLocaleString('vi-VN') + ' VNĐ'; } } }
                        },
                        scales: {
                            y: { beginAtZero: true, ticks: { callback: function(value) { if (value >= 1000000) return (value / 1000000) + ' Tr'; if (value >= 1000) return (value / 1000) + ' K'; return value; } } },
                            x: { grid: { display: false } }
                        }
                    }
                });
            }
        }

        function renderTimelineView() {
            const timelineContainer = document.getElementById('timelineContainer');
            const selectedDate = calendarDateInput.value;
            const startHour = 5;
            const endHour = 20;

            let timelineData = {};
            for(let h = startHour; h <= endHour; h++) {
                timelineData[h] = { "1": null, "2": null, "3": null, "4": null };
            }

            Object.values(globalGroupedBookings).forEach(group => {
                if (group.dateYMD === selectedDate) {
                    let cIndex = null;
                    if (String(group.court).includes('1')) cIndex = "1";
                    else if (String(group.court).includes('2')) cIndex = "2";
                    else if (String(group.court).includes('3')) cIndex = "3";
                    else if (String(group.court).includes('4')) cIndex = "4";

                    if (cIndex) {
                        group.parsedHours.forEach(h => {
                            if(timelineData[h]) timelineData[h][cIndex] = group;
                        });
                    }
                }
            });

            let html = `<table class="timeline-table">
                <thead>
                    <tr>
                        <th class="time-col">GIỜ</th>
                        <th>Sân 1</th>
                        <th>Sân 2</th>
                        <th>Sân 3 (BWF)</th>
                        <th>Sân 4 (BWF)</th>
                    </tr>
                </thead>
                <tbody>`;
            
            for(let h = startHour; h <= endHour; h++) {
                html += `<tr><td class="time-col">${String(h).padStart(2, '0')}:00</td>`;
                ["1", "2", "3", "4"].forEach(c => {
                    let cellData = timelineData[h][c];
                    if (cellData) {
                        let statusClass = cellData.status === "Đã thanh toán" ? "tl-paid" : "tl-pending";
                        html += `<td class="tl-cell booked ${statusClass}">
                                    <div class="tl-content">
                                        <span class="tl-name">${cellData.customerName}</span>
                                        <span class="tl-status">${cellData.status}</span>
                                    </div>
                                 </td>`;
                    } else {
                        html += `<td class="tl-cell free" onclick="openBookingModalWithData('${c}', '${h}')">Trống</td>`;
                    }
                });
                html += `</tr>`;
            }
            html += `</tbody></table>`;
            timelineContainer.innerHTML = html;
        }

        window.openBookingModalWithData = function(courtNum, hour) {
            document.getElementById('bookingModal').classList.add('active');
            document.getElementById('timeSelect').value = `${String(hour).padStart(2, '0')}:00 - ${String(parseInt(hour)+1).padStart(2, '0')}:00`;
            let courtSelect = document.getElementById('courtSelect');
            for(let i=0; i<courtSelect.options.length; i++) {
                if(courtSelect.options[i].text.includes(`Sân ${courtNum}`)) {
                    courtSelect.selectedIndex = i; break;
                }
            }
        }

        function renderAllViews() {
            parseBookingsData();
            renderDashboardView();
            renderTimelineView();
        }

        onSnapshot(query(bookingsCollection, orderBy("createdAt", "desc")), (snapshot) => {
            globalRawDocs = [];
            snapshot.forEach(doc => globalRawDocs.push(doc));
            renderAllViews();
        });

        // ==============================================
        // LẮNG NGHE YÊU CẦU DỊCH VỤ
        // ==============================================
        onSnapshot(query(requestsCollection, orderBy("createdAt", "desc")), (snapshot) => {
            reqList.innerHTML = ""; 
            if(snapshot.empty) reqList.innerHTML = '<div style="padding:15px; text-align:center; color:gray; font-size:0.9rem;">Không có yêu cầu nào đang chờ xử lý.</div>';

            snapshot.forEach((firebaseDoc) => {
                const data = firebaseDoc.data();
                const docId = firebaseDoc.id;
                
                const div = document.createElement('div');
                div.className = 'service-item';
                div.innerHTML = `
                    <div class="racket-icon bg-blue-light"><i class='bx bx-bell'></i></div>
                    <div class="service-details">
                        <h4>Yêu cầu: ${data.targetName}</h4>
                        <p>${data.itemName} <span style="font-weight:bold; color:var(--danger)">(${formatMoney(data.price)})</span></p>
                    </div>
                    <div class="service-status text-warning">Đang chờ</div>
                `;
                
                div.addEventListener('click', async () => {
                    if(confirm("Xác nhận Đã Giao và tính tiền vào hóa đơn khách hàng này?")) {
                        try {
                            if(data.bookingId && data.bookingId !== "vang-lai") {
                                const allRows = document.querySelectorAll('#bookingTbody tr');
                                let targetRowHTML = null;
                                allRows.forEach(row => { if(row.getAttribute('data-id').includes(data.bookingId)) targetRowHTML = row; });
                                
                                if (targetRowHTML) {
                                    const docIdsArray = targetRowHTML.getAttribute('data-id').split(',');
                                    let currentGroupPrice = parseInt(targetRowHTML.getAttribute('data-price'));
                                    
                                    let newTotalForGroup = currentGroupPrice + data.price;
                                    let serviceDetailStr = `${data.itemName} - ${formatMoney(data.price)}`;
                                    
                                    let currentServicesStr = targetRowHTML.getAttribute('data-services') || "";
                                    let servicesArr = currentServicesStr ? currentServicesStr.split('|||') : [];
                                    servicesArr.push(serviceDetailStr); 
                                    
                                    for(let i = 0; i < docIdsArray.length; i++) {
                                        const ref = doc(db, "bookings", docIdsArray[i]);
                                        if (i === 0) {
                                            await updateDoc(ref, { 
                                                price: newTotalForGroup, 
                                                status: "Chưa thanh toán",
                                                extraServices: servicesArr
                                            });
                                        } else {
                                            await updateDoc(ref, { price: 0, status: "Chưa thanh toán" });
                                        }
                                    }
                                    alert(`Đã cộng ${formatMoney(data.price)} vào hóa đơn.`);
                                } else {
                                    alert("Lỗi: Không tìm thấy hóa đơn của khách trên bảng!");
                                }
                            } else { 
                                alert("Đã hoàn thành giao cho khách vãng lai. Vui lòng thu tiền mặt."); 
                            }
                            await deleteDoc(doc(db, "requests", docId));
                        } catch (error) { 
                            console.error(error); 
                            alert("Lỗi: " + error.message);
                        }
                    }
                });
                reqList.appendChild(div);
            });
        });

        // ==============================================
        // TÍNH NĂNG EXPORT CSV
        // ==============================================
        document.getElementById('exportCsvBtn').addEventListener('click', () => {
            let csvContent = "\uFEFF"; 
            csvContent += "Mã Booking,Khách Hàng,Sân/Giờ,Trạng Thái,Tiền\n";
            
            const rows = document.querySelectorAll('#bookingTbody tr:not(.fade-out)');
            if(rows.length === 0 || rows[0].innerText.includes("Không có")) {
                alert("Không có dữ liệu để xuất!"); return;
            }

            rows.forEach(row => {
                let code = row.querySelector('.booking-id').innerText.trim();
                let name = row.querySelector('.customer-name').innerText.trim();
                let courtInfo = row.querySelector('strong').innerText.trim() + " (" + row.querySelector('.booking-time-muted').innerText.trim() + ")";
                let status = row.querySelector('.status-badge').innerText.trim();
                let price = row.querySelector('.amount').innerText.replace(/,/g, '').replace(' VNĐ', '').trim();
                
                csvContent += `"${code}","${name}","${courtInfo}","${status}","${price}"\n`;
            });

            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement("a");
            const url = URL.createObjectURL(blob);
            link.setAttribute("href", url);
            link.setAttribute("download", `BaoCao_ApexCourt_${dateFilterInput.value}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        });

        // ==============================================
        // MENU 3 CHẤM, IN HÓA ĐƠN & EDIT
        // ==============================================
        let targetRow = null; 
        const actionMenu = document.getElementById('actionMenu');
        
        function attachMenuEvent() {
            document.querySelectorAll('.action-dots').forEach(btn => {
                const newBtn = btn.cloneNode(true);
                btn.replaceWith(newBtn);
                newBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    targetRow = e.target.closest('tr');
                    const status = targetRow.querySelector('.status-badge').innerText.trim();

                    if (status === "Đã thanh toán") {
                        document.getElementById('btnPay').style.display = "none"; document.getElementById('btnPrint').style.display = "flex";
                    } else {
                        document.getElementById('btnPay').style.display = "flex"; document.getElementById('btnPrint').style.display = "none";
                    }
                    actionMenu.style.top = (e.pageY + 10) + 'px'; actionMenu.style.left = (e.pageX - 150) + 'px'; actionMenu.classList.add('active');
                });
            });
        }
        window.addEventListener('click', () => { actionMenu.classList.remove('active'); });

        document.getElementById('btnPay').addEventListener('click', async () => {
            if(targetRow) {
                const docIds = targetRow.getAttribute('data-id').split(',');
                try {
                    for(let id of docIds) { await updateDoc(doc(db, "bookings", id), { status: "Đã thanh toán" }); }
                    alert("Thanh toán thành công toàn bộ hóa đơn!");
                } catch(e) { console.error(e); }
            }
            actionMenu.classList.remove('active');
        });

        document.getElementById('btnDelete').addEventListener('click', async () => {
            if(confirm('Hủy lịch sân này? (Dữ liệu sẽ bị xóa hoàn toàn)')) {
                const docIds = targetRow.getAttribute('data-id').split(',');
                try { for(let id of docIds) { await deleteDoc(doc(db, "bookings", id)); } } catch(e) { console.error(e); }
            }
            actionMenu.classList.remove('active');
        });

        document.getElementById('btnEdit').addEventListener('click', () => {
            if(targetRow) {
                document.getElementById('editCustomerName').value = targetRow.getAttribute('data-raw-name');
                document.getElementById('editPrice').value = targetRow.getAttribute('data-price');
                document.getElementById('editModal').classList.add('active');
            }
            actionMenu.classList.remove('active');
        });

        document.getElementById('closeEditModalBtn').addEventListener('click', () => document.getElementById('editModal').classList.remove('active'));

        document.getElementById('editForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const newName = document.getElementById('editCustomerName').value;
            const newPrice = parseInt(document.getElementById('editPrice').value);
            const submitBtn = document.getElementById('submitEdit');
            
            submitBtn.innerHTML = "Đang lưu..."; submitBtn.disabled = true;

            if(targetRow) {
                const docIds = targetRow.getAttribute('data-id').split(',');
                try {
                    for(let i = 0; i < docIds.length; i++) {
                        const ref = doc(db, "bookings", docIds[i]);
                        if (i === 0) {
                            await updateDoc(ref, { customerName: newName, price: newPrice });
                        } else {
                            await updateDoc(ref, { customerName: newName, price: 0 });
                        }
                    }
                    document.getElementById('editModal').classList.remove('active');
                    alert("Đã cập nhật thông tin thành công!");
                } catch(err) { console.error(err); alert("Lỗi kết nối Firebase!"); }
            }
            submitBtn.innerHTML = "Lưu Chỉnh Sửa"; submitBtn.disabled = false;
        });

        document.getElementById('btnPrint').addEventListener('click', () => {
            if(targetRow) {
                document.getElementById('rDate').innerText = new Date().toLocaleDateString();
                document.getElementById('rId').innerText = targetRow.querySelector('.booking-id').innerText;
                document.getElementById('rName').innerText = targetRow.querySelector('.customer-name').innerText;
                
                document.getElementById('rCourt').innerText = targetRow.getAttribute('data-court');
                document.getElementById('rTime').innerText = targetRow.getAttribute('data-time');

                let servicesStr = targetRow.getAttribute('data-services');
                let servicesArea = document.getElementById('rServicesArea');
                let servicesList = document.getElementById('rServicesList');
                
                servicesList.innerHTML = "";
                if (servicesStr && servicesStr.trim() !== "") {
                    servicesArea.style.display = "block";
                    let arr = servicesStr.split('|||');
                    arr.forEach(item => {
                        if(item) servicesList.innerHTML += `<li>+ ${item}</li>`;
                    });
                } else {
                    servicesArea.style.display = "none";
                }

                document.getElementById('rTotal').innerText = targetRow.querySelector('.amount').innerText;
                window.print();
            }
            actionMenu.classList.remove('active');
        });

        // ==============================================
        // OFFLINE BOOKING & TẠO YÊU CẦU MỚI TÍNH GIÁ ĐỘNG 
        // ==============================================
        document.getElementById('newBookingBtn').addEventListener('click', () => document.getElementById('bookingModal').classList.add('active'));
        document.getElementById('closeBookingModalBtn').addEventListener('click', () => document.getElementById('bookingModal').classList.remove('active'));
        
        document.getElementById('bookingForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = document.getElementById('customerName').value;
            const courtVal = document.getElementById('courtSelect').value; // Đã đổi chỉ lấy tên sân
            const timeSlot = document.getElementById('timeSelect').value;
            const submitBtn = document.getElementById('submitBooking');

            submitBtn.innerHTML = "Đang lưu..."; submitBtn.classList.add('btn-loading'); submitBtn.disabled = true;

            // Tự động tính tiền cho Admin (Có kết hợp Flash sale)
            let hours = [];
            let match = String(timeSlot).match(/(\d{1,2})(?::\d{2}|h|g).*?(?:-|đến|den).*?(\d{1,2})(?::\d{2}|h|g)/i);
            if (match) {
                let s = parseInt(match[1]);
                let e = parseInt(match[2]);
                if (s >= 5 && s <= 20 && e > s) { for(let h = s; h < e; h++) hours.push(h); }
            } else {
                let singleMatch = String(timeSlot).match(/(\d{1,2})(?::\d{2}|h|g)/);
                if (singleMatch) {
                    let h = parseInt(singleMatch[1]);
                    if (h >= 5 && h <= 20) hours.push(h);
                }
            }

            let courtPrice = 0;
            let minHour = 24;
            hours.forEach(h => {
                courtPrice += (h >= 17) ? 120000 : 80000;
                if (h < minHour) minHour = h;
            });

            const now = new Date();
            if (minHour < 24) {
                let currentMins = now.getHours() * 60 + now.getMinutes();
                let startMins = minHour * 60;
                let diff = startMins - currentMins;
                if (diff >= 30 && diff <= 60) {
                    courtPrice = courtPrice * 0.7; // Giảm 30% nếu đặt sát giờ
                }
            }

            if (courtPrice === 0) courtPrice = 80000;

            try {
                await addDoc(bookingsCollection, {
                    bookingCode: '#OFF-' + Math.floor(Math.random() * 9000 + 1000), 
                    customerName: name + " (Offline)", court: courtVal, price: courtPrice, 
                    status: "Chưa thanh toán", time: timeSlot, createdAt: serverTimestamp(),
                    extraServices: [] 
                });
                this.reset(); document.getElementById('bookingModal').classList.remove('active');
            } catch (e) { alert("Lỗi kết nối Firebase!"); }
            submitBtn.innerHTML = "Lưu Thông Tin Sân"; submitBtn.classList.remove('btn-loading'); submitBtn.disabled = false;
        });

        document.getElementById('newRequestBtn').addEventListener('click', () => {
            const select = document.getElementById('requestTarget');
            select.innerHTML = '<option value="vang-lai">Khách vãng lai (Thu tiền mặt)</option>';
            document.querySelectorAll('#bookingTbody tr').forEach(row => {
                const id = row.getAttribute('data-id').split(',')[0]; 
                const name = row.querySelector('.customer-name').innerText;
                const court = row.querySelector('strong').innerText;
                select.innerHTML += `<option value="${id}">${court} - ${name}</option>`;
            });
            document.getElementById('requestModal').classList.add('active');
        });
        document.getElementById('closeRequestModalBtn').addEventListener('click', () => document.getElementById('requestModal').classList.remove('active'));

        document.getElementById('requestForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const targetSelect = document.getElementById('requestTarget');
            const itemSelect = document.getElementById('requestItem');
            
            let itemName = "";
            let itemPrice = 0;
            
            if (itemSelect.value.includes('|')) {
                const parts = itemSelect.value.split('|');
                itemName = parts[0];
                itemPrice = parseInt(parts[1]);
            } else {
                itemName = itemSelect.value;
                const textDisplay = itemSelect.options[itemSelect.selectedIndex].text;
                let priceMatch = textDisplay.match(/(\d+[,.]?\d*)\s*(?:VNĐ|VND|K|đ)/i);
                if (priceMatch) {
                    itemPrice = parseInt(priceMatch[1].replace(/[.,]/g, ''));
                    if (itemPrice < 1000 && textDisplay.toLowerCase().includes('k')) itemPrice *= 1000;
                }
            }

            const submitBtn = document.getElementById('submitRequest');
            const now = new Date();
            const timeString = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0');

            submitBtn.innerHTML = "Đang gửi..."; submitBtn.classList.add('btn-loading'); submitBtn.disabled = true;

            try {
                await addDoc(requestsCollection, {
                    targetName: targetSelect.options[targetSelect.selectedIndex].text,
                    bookingId: targetSelect.value, 
                    itemName: itemName, 
                    price: itemPrice,
                    time: timeString, createdAt: serverTimestamp()
                });
                document.getElementById('requestModal').classList.remove('active');
                
                unreadNotifs++;
                if (notifBadge) { notifBadge.style.display = 'flex'; notifBadge.innerText = unreadNotifs; }
                const notifList = document.getElementById('notifList');
                if (notifList) {
                    notifList.innerHTML = `
                        <div class="notif-item">
                            <div class="notif-icon bg-orange-light"><i class='bx bx-bell'></i></div>
                            <div class="notif-content"><p>Yêu cầu: <strong>${itemName}</strong></p><span>Vừa xong</span></div>
                        </div>
                    ` + (notifList.innerHTML.includes('Chưa có thông báo') ? "" : notifList.innerHTML);
                }
            } catch (e) { alert("Lỗi kết nối Firebase!"); }
            submitBtn.innerHTML = "Ghi Nhận Yêu Cầu"; submitBtn.classList.remove('btn-loading'); submitBtn.disabled = false;
        });

        // UI NAVIGATION & LOCALSTORAGE
        const navLinks = document.querySelectorAll('.nav-btn');
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault(); navLinks.forEach(l => l.classList.remove('active')); this.classList.add('active');
                document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active')); document.getElementById(this.getAttribute('data-target')).classList.add('active');
            });
        });

        if (localStorage.getItem('apex_theme') === 'dark') {
            document.body.classList.add('dark-theme');
            document.querySelector('#darkModeToggle i').className = 'bx bx-sun';
        }

        document.getElementById('darkModeToggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            if (document.body.classList.contains('dark-theme')) {
                document.querySelector('#darkModeToggle i').className = 'bx bx-sun';
                localStorage.setItem('apex_theme', 'dark');
            } else {
                document.querySelector('#darkModeToggle i').className = 'bx bx-moon';
                localStorage.setItem('apex_theme', 'light');
            }
        });

        const notifBtn = document.getElementById('notificationBtn');
        const notifDropdown = document.getElementById('notificationDropdown');
        if (notifBtn) {
            notifBtn.addEventListener('click', (e) => { 
                e.stopPropagation(); 
                if (notifDropdown) notifDropdown.classList.toggle('active'); 
            });
        }

        const markAllReadBtn = document.getElementById('markAllRead');
        if (markAllReadBtn) {
            markAllReadBtn.addEventListener('click', () => {
                document.getElementById('notifList').innerHTML = '<div style="padding: 15px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">Chưa có thông báo mới</div>';
                if (notifBadge) notifBadge.style.display = 'none'; 
                unreadNotifs = 0;
            });
        }

        window.addEventListener('click', (e) => { 
            if (notifDropdown && !notifDropdown.contains(e.target) && e.target !== notifBtn) {
                notifDropdown.classList.remove('active'); 
            }
        });

        const sidebarToggle = document.getElementById('sidebarToggle');
        if(sidebarToggle) {
            sidebarToggle.addEventListener('click', () => document.getElementById('sidebar').classList.toggle('active'));
        }