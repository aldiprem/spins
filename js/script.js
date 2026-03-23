// API Base URL - GANTI DENGAN TUNNEL URL ANDA
const API_BASE_URL = 'https://forum-everybody-pitch-believe.trycloudflare.com';

let currentPage = 'dashboard';
let currentData = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadStats();
    loadPage('dashboard');
    
    // Event listeners
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            const page = item.dataset.page;
            loadPage(page);
            
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
    
    document.getElementById('refreshBtn').addEventListener('click', () => {
        loadPage(currentPage);
    });
    
    document.getElementById('exportBtn').addEventListener('click', exportData);
});

async function loadStats() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/stats`);
        const result = await response.json();
        
        if (result.success) {
            document.getElementById('totalComments').textContent = result.data.total_comments;
            document.getElementById('totalUsers').textContent = result.data.total_users;
            document.getElementById('totalPosts').textContent = result.data.total_posts;
        }
    } catch (error) {
        console.error('Error loading stats:', error);
    }
}

async function loadPage(page) {
    currentPage = page;
    const contentArea = document.getElementById('contentArea');
    const pageTitle = document.getElementById('pageTitle');
    const pageDescription = document.getElementById('pageDescription');
    
    contentArea.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Loading...</div>';
    
    switch(page) {
        case 'dashboard':
            pageTitle.textContent = 'Dashboard';
            pageDescription.textContent = 'Statistik komentar Telegram';
            await loadDashboard();
            break;
        case 'comments':
            pageTitle.textContent = 'Komentar';
            pageDescription.textContent = 'Daftar semua komentar';
            await loadComments();
            break;
        case 'users':
            pageTitle.textContent = 'User';
            pageDescription.textContent = 'Daftar user yang berkomentar';
            await loadUsers();
            break;
        case 'posts':
            pageTitle.textContent = 'Post';
            pageDescription.textContent = 'Post yang sudah diproses';
            await loadPosts();
            break;
        case 'search':
            pageTitle.textContent = 'Cari';
            pageDescription.textContent = 'Cari komentar';
            await loadSearch();
            break;
    }
}

async function loadDashboard() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/stats`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        const data = result.data;
        
        let html = `
            <div class="dashboard-grid">
                <div class="card">
                    <div class="card-title">
                        <i class="fas fa-chart-line"></i>
                        <span>Top 10 Komentator</span>
                    </div>
                    <table>
                        <thead>
                            <tr><th>Username</th><th>Nama</th><th>Komentar</th></tr>
                        </thead>
                        <tbody>
        `;
        
        data.top_users.forEach(user => {
            const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || '-';
            const username = user.username ? `@${user.username}` : '-';
            html += `<tr><td>${username}</td><td>${name}</td><td>${user.total_comments}</td></tr>`;
        });
        
        html += `
                        </tbody>
                    </table>
                </div>
                
                <div class="card">
                    <div class="card-title">
                        <i class="fas fa-calendar"></i>
                        <span>Statistik Harian (30 hari terakhir)</span>
                    </div>
                    <canvas id="dailyChart"></canvas>
                </div>
            </div>
        `;
        
        document.getElementById('contentArea').innerHTML = html;
        
        // Load chart
        const ctx = document.getElementById('dailyChart').getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: data.daily_stats.map(s => s.date).reverse(),
                datasets: [{
                    label: 'Komentar',
                    data: data.daily_stats.map(s => s.count).reverse(),
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false
            }
        });
        
    } catch (error) {
        document.getElementById('contentArea').innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

async function loadComments(page = 1) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/comments?page=${page}&per_page=20`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        let html = `
            <div class="comments-table">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>User</th>
                            <th>Komentar</th>
                            <th>Post Link</th>
                            <th>Tanggal</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        result.data.forEach(comment => {
            const name = `${comment.user_first_name || ''} ${comment.user_last_name || ''}`.trim() || comment.user_username || 'Anonymous';
            const initial = name.charAt(0).toUpperCase();
            
            html += `
                <tr>
                    <td>${comment.comment_id}</td>
                    <td>
                        <div class="user-info">
                            <div class="user-avatar">${initial}</div>
                            <span>${escapeHtml(name)}</span>
                        </div>
                    </td>
                    <td class="comment-text" title="${escapeHtml(comment.comment_text)}">${escapeHtml(comment.comment_text || '')}</td>
                    <td><a href="${comment.post_link}" target="_blank">Lihat</a></td>
                    <td>${new Date(comment.comment_date).toLocaleString('id-ID')}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="pagination"></div>
        `;
        
        document.getElementById('contentArea').innerHTML = html;
        
        // Pagination
        const pagination = document.getElementById('pagination');
        for (let i = 1; i <= result.pagination.total_pages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            if (i === page) btn.classList.add('active');
            btn.onclick = () => loadComments(i);
            pagination.appendChild(btn);
        }
        
    } catch (error) {
        document.getElementById('contentArea').innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

async function loadUsers(page = 1) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/users?page=${page}&per_page=20`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        let html = `
            <div class="comments-table">
                <table>
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Username</th>
                            <th>Nama</th>
                            <th>Total Komentar</th>
                            <th>Terakhir Komentar</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        result.data.forEach(user => {
            const name = `${user.first_name || ''} ${user.last_name || ''}`.trim() || '-';
            const username = user.username ? `@${user.username}` : '-';
            
            html += `
                <tr>
                    <td>${user.user_id}</td>
                    <td>${escapeHtml(username)}</td>
                    <td>${escapeHtml(name)}</td>
                    <td>${user.total_comments}</td>
                    <td>${user.last_comment_date ? new Date(user.last_comment_date).toLocaleString('id-ID') : '-'}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="pagination"></div>
        `;
        
        document.getElementById('contentArea').innerHTML = html;
        
        // Pagination
        const pagination = document.getElementById('pagination');
        for (let i = 1; i <= result.pagination.total_pages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            if (i === page) btn.classList.add('active');
            btn.onclick = () => loadUsers(i);
            pagination.appendChild(btn);
        }
        
    } catch (error) {
        document.getElementById('contentArea').innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

async function loadPosts() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/posts`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        let html = `
            <div class="comments-table">
                <table>
                    <thead>
                        <tr>
                            <th>Post Link</th>
                            <th>Komentar</th>
                            <th>User</th>
                            <th>Diproses</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        result.data.forEach(post => {
            html += `
                <tr>
                    <td><a href="${post.post_link}" target="_blank">${post.post_link}</a></td>
                    <td>${post.comments_count}</td>
                    <td>${post.users_count}</td>
                    <td>${new Date(post.processed_at).toLocaleString('id-ID')}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
        `;
        
        document.getElementById('contentArea').innerHTML = html;
        
    } catch (error) {
        document.getElementById('contentArea').innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

async function loadSearch() {
    let html = `
        <div class="search-box">
            <input type="text" id="searchInput" placeholder="Cari komentar..." onkeypress="if(event.key==='Enter') searchComments()">
            <button class="btn btn-primary" onclick="searchComments()">
                <i class="fas fa-search"></i> Cari
            </button>
        </div>
        <div id="searchResults"></div>
    `;
    
    document.getElementById('contentArea').innerHTML = html;
}

async function searchComments(page = 1) {
    const keyword = document.getElementById('searchInput').value;
    if (!keyword) return;
    
    const resultsDiv = document.getElementById('searchResults');
    resultsDiv.innerHTML = '<div class="loading"><i class="fas fa-spinner fa-spin"></i> Searching...</div>';
    
    try {
        const response = await fetch(`${API_BASE_URL}/api/search?q=${encodeURIComponent(keyword)}&page=${page}&per_page=20`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        if (result.data.length === 0) {
            resultsDiv.innerHTML = '<div class="card">Tidak ada komentar yang ditemukan.</div>';
            return;
        }
        
        let html = `
            <div class="comments-table">
                <table>
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Komentar</th>
                            <th>Post Link</th>
                            <th>Tanggal</th>
                        </tr>
                    </thead>
                    <tbody>
        `;
        
        result.data.forEach(comment => {
            const name = `${comment.user_first_name || ''} ${comment.user_last_name || ''}`.trim() || comment.user_username || 'Anonymous';
            
            html += `
                <tr>
                    <td>${escapeHtml(name)}</td>
                    <td class="comment-text" title="${escapeHtml(comment.comment_text)}">${escapeHtml(comment.comment_text || '')}</td>
                    <td><a href="${comment.post_link}" target="_blank">Lihat</a></td>
                    <td>${new Date(comment.comment_date).toLocaleString('id-ID')}</td>
                </tr>
            `;
        });
        
        html += `
                    </tbody>
                </table>
            </div>
            <div class="pagination" id="searchPagination"></div>
        `;
        
        resultsDiv.innerHTML = html;
        
        // Pagination
        const pagination = document.getElementById('searchPagination');
        for (let i = 1; i <= result.pagination.total_pages; i++) {
            const btn = document.createElement('button');
            btn.textContent = i;
            if (i === page) btn.classList.add('active');
            btn.onclick = () => searchComments(i);
            pagination.appendChild(btn);
        }
        
    } catch (error) {
        resultsDiv.innerHTML = `<div class="error">Error: ${error.message}</div>`;
    }
}

async function exportData() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/export`);
        const result = await response.json();
        
        if (!result.success) throw new Error(result.error);
        
        // Download CSV
        const blob = new Blob([result.csv_data], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `comments_export_${new Date().toISOString().slice(0,19)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
    } catch (error) {
        alert('Error exporting data: ' + error.message);
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
