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
        let unreadNotifs = 0;

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

        function updateDashboardStats() {
            const rows = document.querySelectorAll('#bookingTbody tr:not(.fade-out)');
            let totalRevenue = 0;
            let totalPending = 0;
            rows.forEach(row => {
                const status = row.querySelector('.status-badge').innerText.trim();
                const price = parseInt(row.getAttribute('data-price')) || 0;
                if (status === "Đã thanh toán") { totalRevenue += price; } 
                else { totalPending += 1; }
            });
            
            const totalBookings = rows.length;
            document.getElementById('statTotalBookings').innerText = totalBookings;
            document.getElementById('statRevenue').innerText = formatMoney(totalRevenue);
            document.getElementById('statPending').innerText = totalPending;
            const MAX_DAILY_SLOTS = 64; 
            document.getElementById('statOccupancy').innerText = (totalBookings > 0 ? Math.min(Math.round((totalBookings / MAX_DAILY_SLOTS) * 100), 100) : 0) + '%';
        }

        // ==============================================
        // LẮNG NGHE LỊCH ĐẶT SÂN
        // ==============================================
        onSnapshot(query(bookingsCollection, orderBy("createdAt", "desc")), (snapshot) => {
            tbody.innerHTML = ""; 
            document.getElementById('col-san1').innerHTML = ""; document.getElementById('col-san2').innerHTML = "";
            document.getElementById('col-san3').innerHTML = ""; document.getElementById('col-san4').innerHTML = "";

            if(snapshot.empty) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Chưa có dữ liệu đặt sân.</td></tr>';
                updateDashboardStats();
                return;
            }

            let groupedBookings = {};
            let customers = {};

            snapshot.forEach((firebaseDoc) => {
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
                if (cleanPrice === 0) {
                    let isPremium = String(court).includes('3') || String(court).includes('4') || String(court).toLowerCase().includes('bwf');
                    let isGolden = String(time).match(/17|18|19|20/);
                    cleanPrice = (isPremium || isGolden) ? 120000 : 90000;
                }

                let dateStr = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate().toLocaleDateString() : "Hôm nay") : "Unknown";
                const groupKey = `${cName}_${court}_${status}_${dateStr}`;

                if (!groupedBookings[groupKey]) {
                    groupedBookings[groupKey] = { 
                        docIds: [docId], bookingCode: bCode, customerName: cName, court: court, 
                        totalPrice: cleanPrice, status: status, times: [time],
                        hasRealPrice: rawPrice > 0,
                        services: [...extraServices] 
                    };
                } else {
                    groupedBookings[groupKey].docIds.push(docId); 
                    if (rawPrice > 0) {
                        if (!groupedBookings[groupKey].hasRealPrice) {
                            groupedBookings[groupKey].totalPrice = cleanPrice;
                            groupedBookings[groupKey].hasRealPrice = true;
                        } else {
                            groupedBookings[groupKey].totalPrice += cleanPrice;
                        }
                    } else if (!groupedBookings[groupKey].hasRealPrice) {
                        groupedBookings[groupKey].totalPrice += cleanPrice;
                    }
                    if (!groupedBookings[groupKey].times.includes(time)) groupedBookings[groupKey].times.push(time); 
                    if (extraServices.length > 0) groupedBookings[groupKey].services.push(...extraServices);
                }

                if(!customers[cName]) {
                    customers[cName] = { count: 1, totalSpent: cleanPrice };
                } else {
                    customers[cName].count += 1;
                    if (!groupedBookings[groupKey].hasRealPrice) customers[cName].totalSpent += cleanPrice;
                }
            });

            Object.values(groupedBookings).forEach(group => {
                let statusClass = group.status === "Đã thanh toán" ? "status-paid" : "status-pending";
                let statusColor = group.status === "Mới" ? "background-color:#eff6ff; color:#3b82f6;" : "";
                let displayTime = formatTimeDisplay(group.times);

                const tr = document.createElement('tr');
                tr.setAttribute('data-id', group.docIds.join(',')); 
                tr.setAttribute('data-price', group.totalPrice);
                tr.setAttribute('data-court', group.court);
                tr.setAttribute('data-time', displayTime);
                tr.setAttribute('data-services', group.services.join('|||')); // Đóng gói

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

                const courtCard = document.createElement('div');
                courtCard.className = 'schedule-slot';
                courtCard.innerHTML = `<h4>${group.customerName}</h4><p>${displayTime}</p><p style="margin-top:5px; color:var(--primary-color); font-weight:bold;">${group.status}</p>`;
                if (String(group.court).includes('1')) document.getElementById('col-san1').appendChild(courtCard.cloneNode(true));
                else if (String(group.court).includes('2')) document.getElementById('col-san2').appendChild(courtCard.cloneNode(true));
                else if (String(group.court).includes('3')) document.getElementById('col-san3').appendChild(courtCard.cloneNode(true));
                else if (String(group.court).includes('4')) document.getElementById('col-san4').appendChild(courtCard.cloneNode(true));
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
            attachMenuEvent(); updateDashboardStats(); 
        });

        // ==============================================
        // LẮNG NGHE YÊU CẦU & CỘNG TIỀN VÀO HÓA ĐƠN
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
                                    
                                    // 🔥 SỬ DỤNG JAVASCRIPT THUẦN ĐỂ THÊM VÀO MẢNG MÀ KHÔNG CẦN ARRAYUNION 🔥
                                    let currentServicesStr = targetRowHTML.getAttribute('data-services') || "";
                                    let servicesArr = currentServicesStr ? currentServicesStr.split('|||') : [];
                                    servicesArr.push(serviceDetailStr); 
                                    
                                    for(let i = 0; i < docIdsArray.length; i++) {
                                        const ref = doc(db, "bookings", docIdsArray[i]);
                                        if (i === 0) {
                                            await updateDoc(ref, { 
                                                price: newTotalForGroup, 
                                                status: "Chưa thanh toán",
                                                extraServices: servicesArr // Ghi đè mảng mới trực tiếp lên Firebase
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
                            
                            // Chỉ xóa yêu cầu sau khi cộng tiền thành công
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
        // MENU 3 CHẤM VÀ IN HÓA ĐƠN CHI TIẾT
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
        // OFFLINE BOOKING & TẠO YÊU CẦU MỚI
        // ==============================================
        document.getElementById('newBookingBtn').addEventListener('click', () => document.getElementById('bookingModal').classList.add('active'));
        document.getElementById('closeBookingModalBtn').addEventListener('click', () => document.getElementById('bookingModal').classList.remove('active'));
        
        document.getElementById('bookingForm').addEventListener('submit', async function(e) {
            e.preventDefault();
            const name = document.getElementById('customerName').value;
            const courtVal = document.getElementById('courtSelect').value.split('|');
            const timeSlot = document.getElementById('timeSelect').value;
            const submitBtn = document.getElementById('submitBooking');

            submitBtn.innerHTML = "Đang lưu..."; submitBtn.classList.add('btn-loading'); submitBtn.disabled = true;

            try {
                await addDoc(bookingsCollection, {
                    bookingCode: '#OFF-' + Math.floor(Math.random() * 9000 + 1000), 
                    customerName: name + " (Offline)", court: courtVal[0], price: parseInt(courtVal[1]), 
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

        // UI NAVIGATION
        const navLinks = document.querySelectorAll('.nav-btn');
        navLinks.forEach(link => {
            link.addEventListener('click', function(e) {
                e.preventDefault(); navLinks.forEach(l => l.classList.remove('active')); this.classList.add('active');
                document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active')); document.getElementById(this.getAttribute('data-target')).classList.add('active');
            });
        });

        document.getElementById('darkModeToggle').addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
            document.querySelector('#darkModeToggle i').className = document.body.classList.contains('dark-theme') ? 'bx bx-sun' : 'bx bx-moon';
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