from flask import Flask, jsonify, request, send_from_directory
import json
import os
import uuid
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='admin_static', static_url_path='')

BASE_DIR = r"C:\Users\Seratul Mustakim\Desktop\My Works\Food delivery web"
os.makedirs(os.path.join(BASE_DIR, "admin_static"), exist_ok=True)

# Supabase Setup — loaded from .env (service role key for admin operations)
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']

# Two clients:
# - supabase_auth: used only for sign_in (its session gets overwritten by user JWT after login)
# - supabase_db:   dedicated DB client that NEVER calls sign_in, so it always uses the
#                  service role key and bypasses RLS on every query
supabase_auth: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_db: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Keep legacy alias so the rest of the file (foods, orders, stats routes) works unchanged
supabase = supabase_db

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/Foods/<path:filename>')
def serve_food_images(filename):
    return send_from_directory(os.path.join(BASE_DIR, 'Foods'), filename)

# --- AUTH API ---
@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    try:
        # Use supabase_auth so the session switch to user-JWT doesn't contaminate supabase_db
        res = supabase_auth.auth.sign_in_with_password({
            "email": data['email'],
            "password": data['password']
        })
        
        if res.user:
            # Use supabase_db (always service-role key) so RLS never blocks this lookup
            profile_res = supabase_db.table('users_profile').select('*').eq('id', res.user.id).execute()
            if profile_res.data and profile_res.data[0].get('is_admin') == True:
                name = profile_res.data[0].get('name', 'Admin')
                return jsonify({
                    "status": "success", 
                    "message": "Admin Login", 
                    "user": {"name": name, "email": data['email'], "isAdmin": True}
                })
            else:
                return jsonify({"status": "error", "message": "User is not an admin"}), 403
        else:
            return jsonify({"status": "error", "message": "Invalid credentials"}), 401
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

# --- IMAGE UPLOAD API ---
BUCKET_NAME = 'Food images'
ALLOWED_MIME = {'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'}

@app.route('/api/upload-image', methods=['POST'])
def upload_image():
    if 'image' not in request.files:
        return jsonify({"status": "error", "message": "No file provided"}), 400

    file = request.files['image']
    if file.filename == '':
        return jsonify({"status": "error", "message": "No file selected"}), 400

    # Validate MIME type
    if file.content_type not in ALLOWED_MIME:
        return jsonify({"status": "error", "message": "Only image files are allowed"}), 400

    try:
        ext = file.filename.rsplit('.', 1)[-1].lower() if '.' in file.filename else 'jpg'
        filename = f"{uuid.uuid4()}.{ext}"
        file_bytes = file.read()

        supabase_db.storage.from_(BUCKET_NAME).upload(
            path=filename,
            file=file_bytes,
            file_options={"content-type": file.content_type}
        )

        public_url = supabase_db.storage.from_(BUCKET_NAME).get_public_url(filename)
        return jsonify({"status": "success", "url": public_url})
    except Exception as e:
        print(f"Image upload error: {e}")
        return jsonify({"status": "error", "message": "Upload failed"}), 500

# --- MENU API ---
@app.route('/api/foods', methods=['GET'])
def get_foods():
    try:
        # Fetch foods
        foods_res = supabase.table('foods').select('*').execute()
        foods = foods_res.data
        
        # Fetch variants and images
        variants_res = supabase.table('food_variants').select('*').execute()
        images_res = supabase.table('food_images').select('*').execute()
        
        variants = {v['food_id']: v for v in variants_res.data}
        images = {i['food_id']: i for i in images_res.data}
        
        # Format for frontend
        formatted_foods = []
        for f in foods:
            food_id = f['id']
            formatted_foods.append({
                'id': food_id,
                'name': f['name'],
                'description': f.get('description', ''),
                'price': variants.get(food_id, {}).get('price', 0),
                'image': images.get(food_id, {}).get('image_url', 'Foods/placeholder.jpg')
            })
            
        # Sort by creation date or name just for consistency
        formatted_foods.sort(key=lambda x: x['name'])
        return jsonify(formatted_foods)
    except Exception as e:
        print(f"Error fetching foods: {e}")
        return jsonify([])

@app.route('/api/foods', methods=['POST'])
def add_food():
    try:
        data = request.json
        
        # Insert Food
        food_res = supabase.table('foods').insert({
            'name': data['name'],
            'description': data.get('description', ''),
            'is_available': True
        }).execute()
        
        food_id = food_res.data[0]['id']
        
        # Insert Variant (Price)
        supabase.table('food_variants').insert({
            'food_id': food_id,
            'variant_name': 'Default',
            'price': float(data['price'])
        }).execute()
        
        # Insert Image
        image_url = data.get('image') or 'Foods/placeholder.jpg'
        supabase.table('food_images').insert({
            'food_id': food_id,
            'image_url': image_url
        }).execute()
        
        # Return formatted new food
        new_food = {
            'id': food_id,
            'name': data['name'],
            'description': data.get('description', ''),
            'price': float(data['price']),
            'image': image_url
        }
        return jsonify({"status": "success", "message": "Food added successfully!", "food": new_food})
    except Exception as e:
        print(f"Error adding food: {e}")
        return jsonify({"status": "error", "message": "Failed to add food"}), 500

@app.route('/api/foods/<food_id>', methods=['PUT'])
def edit_food(food_id):
    try:
        data = request.json
        
        # Update Food
        supabase.table('foods').update({
            'name': data['name'],
            'description': data.get('description', '')
        }).eq('id', food_id).execute()
        
        # Update Price (assume single default variant for now)
        variants = supabase.table('food_variants').select('id').eq('food_id', food_id).execute()
        if variants.data:
            supabase.table('food_variants').update({
                'price': float(data['price'])
            }).eq('id', variants.data[0]['id']).execute()
            
        # Update Image
        images = supabase.table('food_images').select('id').eq('food_id', food_id).execute()
        if 'image' in data:
            if images.data:
                supabase.table('food_images').update({
                    'image_url': data['image']
                }).eq('id', images.data[0]['id']).execute()
            else:
                supabase.table('food_images').insert({
                    'food_id': food_id,
                    'image_url': data['image']
                }).execute()
                
        return jsonify({"status": "success", "message": "Food updated!"})
    except Exception as e:
        print(f"Error updating food: {e}")
        return jsonify({"status": "error", "message": "Failed to update food"}), 500

@app.route('/api/foods/<food_id>', methods=['DELETE'])
def delete_food(food_id):
    try:
        # Supabase CASCADE delete will handle variants and images
        supabase.table('foods').delete().eq('id', food_id).execute()
        return jsonify({"status": "success", "message": "Food deleted!"})
    except Exception as e:
        print(f"Error deleting food: {e}")
        return jsonify({"status": "error", "message": "Failed to delete food"}), 500

# --- ORDERS API ---
@app.route('/api/orders', methods=['GET'])
def get_orders():
    try:
        # Fetch orders joined with users to get customer name
        orders_res = supabase.table('orders').select('*, users_profile(email, name, phone, address)').order('created_at', desc=True).execute()
        
        # Need to fetch items too. For simplicity in admin view right now we'll do N+1 or fetch all
        items_res = supabase.table('order_items').select('*, foods(name)').execute()
        items_by_order = {}
        for item in items_res.data:
            oid = item['order_id']
            if oid not in items_by_order:
                items_by_order[oid] = []
            items_by_order[oid].append({
                'name': item['foods']['name'] if item.get('foods') else 'Unknown Item',
                'quantity': item['quantity'],
                'price': float(item['price'])
            })
            
        formatted_orders = []
        for o in orders_res.data:
            profile = o.get('users_profile') or {}
            formatted_orders.append({
                'id': o['id'],
                'customer': profile.get('name') or profile.get('email') or 'Guest',
                'phone': profile.get('phone') or 'N/A', # Add phone to users_profile later if needed, or handle it
                'items': items_by_order.get(o['id'], []),
                'total': float(o['total_amount'] or 0),
                'status': o['status']
            })
        return jsonify(formatted_orders)
    except Exception as e:
        print(f"Error fetching orders: {e}")
        return jsonify([])

@app.route('/api/orders/<order_id>/status', methods=['PUT'])
def update_order_status(order_id):
    try:
        status = request.json.get('status')
        supabase.table('orders').update({'status': status}).eq('id', order_id).execute()
        return jsonify({"status": "success"})
    except Exception as e:
        print(f"Error updating order status: {e}")
        return jsonify({"status": "error"}), 500

# --- STATS API ---
@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        # A bit clunky to do this all in memory, but fine for small datasets
        orders_res = supabase.table('orders').select('total_amount, status').execute()
        foods_res = supabase.table('foods').select('id', count='exact').execute()
        
        orders = orders_res.data
        
        total_revenue = sum(float(o.get('total_amount') or 0) for o in orders if o.get('status') != 'Cancelled')
        total_orders = len(orders)
        pending_orders = len([o for o in orders if o.get('status') == 'Pending'])
        total_items = foods_res.count if hasattr(foods_res, 'count') else len(foods_res.data) # depending on supabase-py version
        
        return jsonify({
            "revenue": total_revenue,
            "orders": total_orders,
            "pending": pending_orders,
            "items": total_items
        })
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return jsonify({"revenue": 0, "orders": 0, "pending": 0, "items": 0})

if __name__ == '__main__':
    app.run(debug=True, port=5001)
