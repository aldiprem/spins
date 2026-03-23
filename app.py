from flask import Flask, jsonify, request, render_template
from flask_cors import CORS
import sqlite3
import os
from datetime import datetime

app = Flask(__name__)
CORS(app)  # Enable CORS for all routes

DB_PATH = 'spins.db'

def get_db_connection():
    """Mendapatkan koneksi database"""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    """Halaman utama"""
    return render_template('index.html')

@app.route('/api/comments')
def get_comments():
    """API untuk mendapatkan semua komentar"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ambil parameter pagination
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        post_id = request.args.get('post_id', type=int)
        user_id = request.args.get('user_id', type=int)
        
        offset = (page - 1) * per_page
        
        # Build query
        query = """
            SELECT 
                id, channel_id, channel_username, channel_title, post_id, post_link,
                comment_id, comment_text, comment_media_type, comment_media_url,
                user_id, user_first_name, user_last_name, user_username,
                user_phone, user_photo_url, user_bio, comment_date, scraped_at
            FROM comments
            WHERE 1=1
        """
        count_query = "SELECT COUNT(*) FROM comments WHERE 1=1"
        params = []
        
        if post_id:
            query += " AND post_id = ?"
            count_query += " AND post_id = ?"
            params.append(post_id)
        
        if user_id:
            query += " AND user_id = ?"
            count_query += " AND user_id = ?"
            params.append(user_id)
        
        query += " ORDER BY comment_date DESC LIMIT ? OFFSET ?"
        count_params = params.copy()
        params.extend([per_page, offset])
        
        # Eksekusi query
        cursor.execute(query, params)
        comments = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': comments,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'total_pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/comments/<int:comment_id>')
def get_comment_detail(comment_id):
    """API untuk mendapatkan detail komentar"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM comments WHERE id = ?
        """, (comment_id,))
        
        comment = cursor.fetchone()
        conn.close()
        
        if comment:
            return jsonify({'success': True, 'data': dict(comment)})
        else:
            return jsonify({'success': False, 'error': 'Comment not found'}), 404
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/stats')
def get_stats():
    """API untuk mendapatkan statistik"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Total komentar
        cursor.execute("SELECT COUNT(*) FROM comments")
        total_comments = cursor.fetchone()[0]
        
        # Total user unik
        cursor.execute("SELECT COUNT(DISTINCT user_id) FROM comments WHERE user_id IS NOT NULL")
        total_users = cursor.fetchone()[0]
        
        # Total post diproses
        cursor.execute("SELECT COUNT(*) FROM processed_posts")
        total_posts = cursor.fetchone()[0]
        
        # Top 10 komentator
        cursor.execute("""
            SELECT user_id, username, first_name, last_name, total_comments
            FROM user_stats
            ORDER BY total_comments DESC
            LIMIT 10
        """)
        top_users = [dict(row) for row in cursor.fetchall()]
        
        # Statistik per hari
        cursor.execute("""
            SELECT DATE(comment_date) as date, COUNT(*) as count
            FROM comments
            GROUP BY DATE(comment_date)
            ORDER BY date DESC
            LIMIT 30
        """)
        daily_stats = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'total_comments': total_comments,
                'total_users': total_users,
                'total_posts': total_posts,
                'top_users': top_users,
                'daily_stats': daily_stats
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/posts')
def get_posts():
    """API untuk mendapatkan daftar post yang sudah diproses"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT * FROM processed_posts
            ORDER BY processed_at DESC
            LIMIT 50
        """)
        
        posts = [dict(row) for row in cursor.fetchall()]
        conn.close()
        
        return jsonify({'success': True, 'data': posts})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/users')
def get_users():
    """API untuk mendapatkan daftar user"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        search = request.args.get('search', '')
        
        offset = (page - 1) * per_page
        
        query = """
            SELECT user_id, username, first_name, last_name, total_comments, last_comment_date
            FROM user_stats
            WHERE 1=1
        """
        count_query = "SELECT COUNT(*) FROM user_stats WHERE 1=1"
        params = []
        
        if search:
            query += " AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ?)"
            count_query += " AND (username LIKE ? OR first_name LIKE ? OR last_name LIKE ?)"
            search_param = f"%{search}%"
            params.extend([search_param, search_param, search_param])
        
        query += " ORDER BY total_comments DESC LIMIT ? OFFSET ?"
        count_params = params.copy()
        params.extend([per_page, offset])
        
        cursor.execute(query, params)
        users = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute(count_query, count_params)
        total = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': users,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'total_pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/search')
def search_comments():
    """API untuk mencari komentar"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        keyword = request.args.get('q', '')
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 20, type=int)
        
        offset = (page - 1) * per_page
        
        query = """
            SELECT * FROM comments
            WHERE comment_text LIKE ?
            ORDER BY comment_date DESC
            LIMIT ? OFFSET ?
        """
        count_query = "SELECT COUNT(*) FROM comments WHERE comment_text LIKE ?"
        
        search_param = f"%{keyword}%"
        
        cursor.execute(query, (search_param, per_page, offset))
        comments = [dict(row) for row in cursor.fetchall()]
        
        cursor.execute(count_query, (search_param,))
        total = cursor.fetchone()[0]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': comments,
            'keyword': keyword,
            'pagination': {
                'page': page,
                'per_page': per_page,
                'total': total,
                'total_pages': (total + per_page - 1) // per_page
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/export')
def export_comments():
    """API untuk export komentar ke CSV"""
    try:
        import csv
        from io import StringIO
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT post_link, comment_text, user_first_name, user_last_name, 
                   user_username, comment_date
            FROM comments
            ORDER BY comment_date DESC
        """)
        
        rows = cursor.fetchall()
        conn.close()
        
        # Buat CSV
        output = StringIO()
        writer = csv.writer(output)
        writer.writerow(['Post Link', 'Comment', 'First Name', 'Last Name', 'Username', 'Date'])
        
        for row in rows:
            writer.writerow(list(row))
        
        return jsonify({
            'success': True,
            'csv_data': output.getvalue(),
            'total': len(rows)
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/posts/<int:post_id>')
def get_post_detail(post_id):
    """API untuk mendapatkan detail post dan komentarnya"""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Ambil data post
        cursor.execute("""
            SELECT * FROM processed_posts 
            WHERE post_link LIKE ?
            ORDER BY processed_at DESC 
            LIMIT 1
        """, (f'%/{post_id}',))
        
        post = cursor.fetchone()
        
        # Ambil komentar untuk post ini
        cursor.execute("""
            SELECT * FROM comments 
            WHERE post_id = ?
            ORDER BY comment_date ASC
        """, (post_id,))
        
        comments = [dict(row) for row in cursor.fetchall()]
        
        conn.close()
        
        return jsonify({
            'success': True,
            'data': {
                'post': dict(post) if post else None,
                'comments': comments,
                'total_comments': len(comments)
            }
        })
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
    
if __name__ == '__main__':
    app.run(host='0.0.0.0', port=4949, debug=True)
