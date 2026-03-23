// API Base URL
const API_BASE_URL = 'https://forum-everybody-pitch-believe.trycloudflare.com';

// Global variables
let currentPage = 'giveaways';
let currentGiveaway = null;
let isSpinning = false;
let currentAngle = 0;
let winnersList = [];
let remainingParticipants = [];
let winnersHistory = [];
let currentWinnerRound = 0;
let totalWinnersNeeded = 0;
let spinAnimationFrame = null;

// Initialize Telegram WebApp
let tg = window.Telegram.WebApp;
tg.expand();
tg.ready();
let currentUser = tg.initDataUnsafe?.user || null;

// DOM Elements
const mainContent = document.getElementById('mainContent');

// Navigation
document.querySelectorAll('.nav-item-gw').forEach(item => {
    item.addEventListener('click', () => {
        const page = item.dataset.page;
        loadPage(page);
        
        document.querySelectorAll('.nav-item-gw').forEach(nav => nav.classList.remove('active'));
        item.classList.add('active');
    });
});

// Load page on start
loadPage('giveaways');

async function loadPage(page) {
    currentPage = page;
    
    switch(page) {
        case 'giveaways':
            await loadGiveaways();
            break;
        case 'activity':
            await loadActivity();
            break;
        case 'profile':
            await loadProfile();
            break;
    }
}

async function loadGiveaways() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/posts`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        const posts = result.data;
        
        if (posts.length === 0) {
            mainContent.innerHTML = `
                <div class="loading-screen">
                    <i class="fas fa-gift"></i>
                    <p>Belum ada giveaway yang diproses</p>
                    <p style="font-size: 12px; margin-top: 8px;">Kirim link postingan ke bot untuk memulai</p>
                </div>
            `;
            return;
        }
        
        let html = '<div class="giveaway-grid">';
        
        posts.forEach(post => {
            const postId = extractPostId(post.post_link);
            html += `
                <div class="giveaway-card" onclick="loadGiveawayDetail('${post.post_link}', '${postId}')">
                    <div class="card-header">
                        <span class="card-title">🎁 Giveaway #${postId}</span>
                        <span class="card-date">${new Date(post.processed_at).toLocaleDateString('id-ID')}</span>
                    </div>
                    <div class="card-stats">
                        <div class="stat">
                            <i class="fas fa-comment"></i>
                            <span>${post.comments_count} komentar</span>
                        </div>
                        <div class="stat">
                            <i class="fas fa-users"></i>
                            <span>${post.users_count} peserta</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        mainContent.innerHTML = html;
        
    } catch (error) {
        console.error('Error loading giveaways:', error);
        mainContent.innerHTML = `<div class="loading-screen"><p>Error: ${error.message}</p></div>`;
    }
}

function extractPostId(postLink) {
    const match = postLink.match(/\/(\d+)$/);
    return match ? match[1] : 'unknown';
}

async function loadGiveawayDetail(postLink, postId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/comments?post_id=${postId}&per_page=1000`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        const comments = result.data;
        
        // Extract unique users dari komentar
        const usersMap = new Map();
        comments.forEach(comment => {
            if (comment.user_id && !usersMap.has(comment.user_id)) {
                usersMap.set(comment.user_id, {
                    id: comment.user_id,
                    name: `${comment.user_first_name || ''} ${comment.user_last_name || ''}`.trim() || comment.user_username || `User_${comment.user_id}`,
                    username: comment.user_username,
                    avatar: comment.user_photo_url
                });
            }
        });
        
        const participants = Array.from(usersMap.values());
        
        // Generate random colors untuk setiap peserta
        const colors = generateRandomColors(participants.length);
        participants.forEach((p, i) => {
            p.color = colors[i];
        });
        
        currentGiveaway = {
            postLink,
            postId,
            participants: [...participants],
            remainingParticipants: [...participants],
            totalParticipants: participants.length
        };
        
        // Reset winners
        winnersList = [];
        winnersHistory = [];
        
        // Tampilkan halaman spin
        showSpinPage();
        
    } catch (error) {
        console.error('Error loading giveaway detail:', error);
        mainContent.innerHTML = `<div class="loading-screen"><p>Error: ${error.message}</p></div>`;
    }
}

function generateRandomColors(count) {
    const colors = [];
    for (let i = 0; i < count; i++) {
        const hue = (i * 137.5) % 360;
        colors.push(`hsl(${hue}, 70%, 55%)`);
    }
    return colors;
}

function showSpinPage() {
    if (currentGiveaway.participants.length === 0) {
        mainContent.innerHTML = `
            <div class="loading-screen">
                <i class="fas fa-users"></i>
                <p>Tidak ada peserta giveaway</p>
                <button class="btn-secondary" onclick="loadGiveaways()" style="margin-top: 16px;">
                    <i class="fas fa-arrow-left"></i> Kembali
                </button>
            </div>
        `;
        return;
    }
    
    mainContent.innerHTML = `
        <div class="giveaway-layout">
            <!-- Left Panel: Wheel and Controls -->
            <div class="wheel-panel">
                <div class="spin-container">
                    <div class="wheel-wrapper">
                        <div class="wheel-pointer"></div>
                        <canvas id="wheelCanvas" width="400" height="400"></canvas>
                        <div class="wheel-center">
                            <i class="fas fa-gift"></i>
                        </div>
                    </div>
                    
                    <div class="controls">
                        <div class="winner-input-group">
                            <i class="fas fa-trophy"></i>
                            <input type="number" id="winnerCount" min="1" max="${currentGiveaway.participants.length}" value="1">
                            <span>pemenang</span>
                        </div>
                        <button class="btn-spin" id="spinBtn" onclick="startSequentialSpin()">
                            <i class="fas fa-play"></i> SPIN
                        </button>
                        <button class="btn-secondary" onclick="loadGiveaways()">
                            <i class="fas fa-arrow-left"></i> Kembali
                        </button>
                    </div>
                </div>
            </div>
            
            <!-- Right Panel: Participants List -->
            <div class="participants-panel">
                <div class="section-header">
                    <i class="fas fa-users"></i>
                    <span>Peserta Giveaway (${currentGiveaway.participants.length})</span>
                </div>
                <div class="participants-grid" id="participantsGrid"></div>
            </div>
        </div>
        
        <!-- Winners Panel (Bottom) -->
        <div class="winners-panel" id="winnersPanel">
            <div class="section-header">
                <i class="fas fa-trophy"></i>
                <span>🏆 Daftar Pemenang 🏆</span>
            </div>
            <div class="winners-list" id="winnersList"></div>
        </div>
        
        <!-- Notification Container -->
        <div id="notificationContainer" class="notification-container"></div>
    `;
    
    // Render participants grid
    renderParticipantsGrid();
    
    // Draw wheel
    drawWheel(currentGiveaway.participants);
}

function renderParticipantsGrid() {
    const grid = document.getElementById('participantsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    currentGiveaway.participants.forEach(p => {
        const isWinner = winnersList.some(w => w.id === p.id);
        const div = document.createElement('div');
        div.className = `participant-item ${isWinner ? 'winner-highlight' : ''}`;
        div.style.borderLeft = `3px solid ${p.color}`;
        div.innerHTML = `
            <div class="participant-color" style="background: ${p.color}"></div>
            <span class="participant-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name.length > 15 ? p.name.substring(0, 15) + '...' : p.name)}</span>
            ${isWinner ? '<i class="fas fa-crown" style="color: gold; font-size: 12px;"></i>' : ''}
        `;
        grid.appendChild(div);
    });
}

function renderWinnersList() {
    const winnersListEl = document.getElementById('winnersList');
    if (!winnersListEl) return;
    
    if (winnersList.length === 0) {
        winnersListEl.innerHTML = '<div class="empty-winners">Belum ada pemenang</div>';
        return;
    }
    
    winnersListEl.innerHTML = '';
    winnersList.forEach((winner, idx) => {
        const winnerDiv = document.createElement('div');
        winnerDiv.className = 'winner-item';
        const initial = winner.name.charAt(0).toUpperCase();
        winnerDiv.innerHTML = `
            <div class="winner-number">#${idx + 1}</div>
            <div class="winner-avatar" style="background: ${winner.color}">${initial}</div>
            <div class="winner-info">
                <div class="winner-name">${escapeHtml(winner.name)}</div>
                <div class="winner-username">${winner.username ? '@' + winner.username : 'ID: ' + winner.id}</div>
            </div>
            <i class="fas fa-trophy" style="color: gold;"></i>
        `;
        winnersListEl.appendChild(winnerDiv);
    });
}

function drawWheel(participants) {
    const canvas = document.getElementById('wheelCanvas');
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const centerX = width / 2;
    const centerY = height / 2;
    const radius = width / 2 - 5;
    
    if (participants.length === 0) {
        // Draw empty wheel
        ctx.clearRect(0, 0, width, height);
        ctx.beginPath();
        ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
        return;
    }
    
    const angleStep = (Math.PI * 2) / participants.length;
    
    ctx.clearRect(0, 0, width, height);
    
    participants.forEach((participant, i) => {
        const startAngle = i * angleStep + currentAngle;
        const endAngle = (i + 1) * angleStep + currentAngle;
        
        ctx.beginPath();
        ctx.moveTo(centerX, centerY);
        ctx.arc(centerX, centerY, radius, startAngle, endAngle);
        ctx.closePath();
        
        ctx.fillStyle = participant.color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Draw text
        ctx.save();
        ctx.translate(centerX, centerY);
        ctx.rotate(startAngle + angleStep / 2);
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = 'white';
        ctx.font = 'bold 12px "Inter"';
        const text = participant.name.length > 10 ? participant.name.substring(0, 8) + '..' : participant.name;
        ctx.fillText(text, radius * 0.7, 5);
        ctx.restore();
    });
    
    // Draw center circle
    ctx.beginPath();
    ctx.arc(centerX, centerY, 25, 0, Math.PI * 2);
    ctx.fillStyle = '#ff6b6b';
    ctx.fill();
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 3;
    ctx.stroke();
}

function showNotification(message, type = 'success') {
    const container = document.getElementById('notificationContainer');
    if (!container) return;
    
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.innerHTML = `
        <i class="fas ${type === 'success' ? 'fa-trophy' : 'fa-info-circle'}"></i>
        <span>${message}</span>
    `;
    
    container.appendChild(notification);
    
    // Animate in
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, 3000);
}

function showConfetti() {
    const confettiCount = 100;
    const container = document.getElementById('mainContent');
    
    for (let i = 0; i < confettiCount; i++) {
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.backgroundColor = `hsl(${Math.random() * 360}, 100%, 50%)`;
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        confetti.style.animationDuration = Math.random() * 1 + 0.5 + 's';
        container.appendChild(confetti);
        
        // Remove after animation
        setTimeout(() => {
            confetti.remove();
        }, 1500);
    }
}

async function startSequentialSpin() {
    if (isSpinning) return;
    
    totalWinnersNeeded = parseInt(document.getElementById('winnerCount').value);
    
    if (totalWinnersNeeded > currentGiveaway.participants.length) {
        showNotification(`Maksimal pemenang adalah ${currentGiveaway.participants.length}`, 'error');
        return;
    }
    
    if (totalWinnersNeeded <= winnersList.length) {
        showNotification(`Sudah terpilih ${winnersList.length} pemenang. Refresh halaman untuk spin ulang.`, 'error');
        return;
    }
    
    currentWinnerRound = winnersList.length + 1;
    
    // Disable spin button
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = true;
    spinBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Memilih pemenang ke-' + currentWinnerRound + '...';
    
    // Get remaining participants (exclude existing winners)
    const remaining = currentGiveaway.participants.filter(p => !winnersList.some(w => w.id === p.id));
    
    if (remaining.length === 0) {
        showNotification('Semua peserta sudah menjadi pemenang!', 'success');
        spinBtn.disabled = false;
        spinBtn.innerHTML = '<i class="fas fa-play"></i> SPIN';
        return;
    }
    
    // Start spin for one winner
    await spinForWinner(remaining);
}

function spinForWinner(remainingParticipants) {
    return new Promise((resolve) => {
        const spinDuration = Math.random() * 4000 + 2000; // 2-6 seconds
        const startTime = Date.now();
        const startAngle = currentAngle;
        const totalRotations = 5 + Math.random() * 8;
        
        function animateSpin() {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(1, elapsed / spinDuration);
            
            // Easing: slow down at the end
            const easeOut = 1 - Math.pow(1 - progress, 3);
            const rotation = totalRotations * Math.PI * 2 * easeOut;
            currentAngle = startAngle + rotation;
            
            drawWheel(currentGiveaway.participants);
            
            if (progress < 1) {
                requestAnimationFrame(animateSpin);
            } else {
                // Determine winner
                const pointerAngle = -Math.PI / 2;
                const angleStep = (Math.PI * 2) / remainingParticipants.length;
                let winnerIndex = Math.floor(((pointerAngle - currentAngle) % (Math.PI * 2) + Math.PI * 2) / angleStep);
                winnerIndex = (winnerIndex + remainingParticipants.length) % remainingParticipants.length;
                
                const winner = remainingParticipants[winnerIndex];
                const winnerNumber = winnersList.length + 1;
                
                // Add to winners list
                winnersList.push(winner);
                winnersHistory.push({
                    round: winnerNumber,
                    winner: winner,
                    timestamp: new Date()
                });
                
                // Show notification
                showNotification(`🎉 Selamat ${winner.name} terpilih sebagai juara ke-${winnerNumber}! 🎉`, 'success');
                
                // Show confetti
                showConfetti();
                
                // Update participants grid highlight
                renderParticipantsGrid();
                renderWinnersList();
                
                // Update wheel to show remaining participants only
                // But keep all participants in wheel with faded colors for winners?
                // We'll keep all but winners are still visible
                drawWheel(currentGiveaway.participants);
                
                // Check if we need more winners
                const spinBtn = document.getElementById('spinBtn');
                
                if (winnersList.length >= totalWinnersNeeded) {
                    // All winners selected
                    spinBtn.disabled = false;
                    spinBtn.innerHTML = '<i class="fas fa-play"></i> SPIN';
                    showNotification(`✨ Giveaway selesai! ${totalWinnersNeeded} pemenang telah terpilih! ✨`, 'success');
                    
                    // Save activity
                    saveActivity(totalWinnersNeeded, winnersList);
                    
                    // Final confetti burst
                    for (let i = 0; i < 3; i++) {
                        setTimeout(() => showConfetti(), i * 200);
                    }
                    
                    resolve(true);
                } else {
                    // Continue to next winner
                    const nextRemaining = currentGiveaway.participants.filter(p => !winnersList.some(w => w.id === p.id));
                    spinBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Memilih pemenang ke-${winnersList.length + 1}...`;
                    
                    // Short delay before next spin
                    setTimeout(async () => {
                        await spinForWinner(nextRemaining);
                        resolve(true);
                    }, 1000);
                }
            }
        }
        
        requestAnimationFrame(animateSpin);
    });
}

function finishSpin() {
    // Reset button
    const spinBtn = document.getElementById('spinBtn');
    spinBtn.disabled = false;
    spinBtn.innerHTML = '<i class="fas fa-play"></i> SPIN';
    isSpinning = false;
}

async function saveActivity(winnerCount, winners) {
    const activity = {
        id: Date.now(),
        type: 'giveaway_spin',
        giveawayId: currentGiveaway.postId,
        giveawayLink: currentGiveaway.postLink,
        winnerCount: winnerCount,
        winners: winners.map((w, idx) => ({ 
            id: w.id, 
            name: w.name, 
            username: w.username,
            rank: idx + 1
        })),
        timestamp: new Date().toISOString()
    };
    
    // Get existing activities from localStorage
    let activities = JSON.parse(localStorage.getItem('giveaway_activities') || '[]');
    activities.unshift(activity);
    activities = activities.slice(0, 50);
    localStorage.setItem('giveaway_activities', JSON.stringify(activities));
}

async function loadActivity() {
    const activities = JSON.parse(localStorage.getItem('giveaway_activities') || '[]');
    
    if (activities.length === 0) {
        mainContent.innerHTML = `
            <div class="loading-screen">
                <i class="fas fa-history"></i>
                <p>Belum ada aktivitas</p>
                <p style="font-size: 12px; margin-top: 8px;">Lakukan spin giveaway untuk melihat riwayat</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="activity-list">';
    
    activities.forEach(activity => {
        const date = new Date(activity.timestamp);
        const winnersText = activity.winners.map(w => `${w.rank}. ${w.name}`).join(', ');
        
        html += `
            <div class="activity-item" onclick="viewActivityDetail('${activity.id}')">
                <div class="activity-icon">
                    <i class="fas fa-trophy"></i>
                </div>
                <div class="activity-content">
                    <div class="activity-title">🎁 Giveaway #${activity.giveawayId}</div>
                    <div class="activity-desc">
                        🏆 ${activity.winnerCount} pemenang: ${winnersText.substring(0, 60)}${winnersText.length > 60 ? '...' : ''}
                    </div>
                    <div class="activity-time">${date.toLocaleString('id-ID')}</div>
                </div>
                <i class="fas fa-chevron-right" style="color: rgba(255,255,255,0.3);"></i>
            </div>
        `;
    });
    
    html += '</div>';
    mainContent.innerHTML = html;
}

async function loadProfile() {
    let userStats = {
        totalSpins: 0,
        totalWins: 0,
        participatedGiveaways: 0
    };
    
    if (currentUser) {
        try {
            const response = await fetch(`${API_BASE_URL}/api/users?search=${currentUser.id}`);
            const result = await response.json();
            
            if (result.success && result.data.length > 0) {
                const userData = result.data[0];
                userStats.totalSpins = userData.total_comments || 0;
            }
        } catch (error) {
            console.error('Error loading user stats:', error);
        }
        
        const activities = JSON.parse(localStorage.getItem('giveaway_activities') || '[]');
        userStats.totalWins = activities.filter(a => 
            a.winners.some(w => w.id === currentUser.id)
        ).length;
        
        userStats.participatedGiveaways = activities.filter(a => 
            a.winners.some(w => w.id === currentUser.id)
        ).length;
    }
    
    const initial = currentUser?.first_name?.charAt(0) || '?';
    const fullName = currentUser ? `${currentUser.first_name || ''} ${currentUser.last_name || ''}`.trim() : 'Guest User';
    
    mainContent.innerHTML = `
        <div class="profile-card">
            <div class="profile-avatar">${initial.toUpperCase()}</div>
            <div class="profile-name">${escapeHtml(fullName || 'Telegram User')}</div>
            <div class="profile-username">${currentUser?.username ? '@' + currentUser.username : 'No username'}</div>
            
            <div class="profile-stats">
                <div class="profile-stat">
                    <div class="profile-stat-value">${userStats.totalSpins}</div>
                    <div class="profile-stat-label">Total Spin</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">${userStats.totalWins}</div>
                    <div class="profile-stat-label">Menang</div>
                </div>
                <div class="profile-stat">
                    <div class="profile-stat-value">${userStats.participatedGiveaways}</div>
                    <div class="profile-stat-label">Giveaway</div>
                </div>
            </div>
            
            ${!currentUser ? `
                <button class="btn-secondary" onclick="alert('Login melalui Telegram Mini App untuk melihat data lengkap')" style="margin-top: 20px;">
                    <i class="fab fa-telegram"></i> Login via Telegram
                </button>
            ` : ''}
        </div>
    `;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
