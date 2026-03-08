from flask import Flask, jsonify, request, send_from_directory
import json
import os
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static', static_url_path='/static')

BASE_DIR = r"C:\Users\Seratul Mustakim\Desktop\My Works\Food delivery web"
os.makedirs(BASE_DIR, exist_ok=True)

# Supabase Setup — loaded from .env
SUPABASE_URL = os.environ['SUPABASE_URL']
SUPABASE_KEY = os.environ['SUPABASE_ANON_KEY']
SUPABASE_SERVICE_KEY = os.environ['SUPABASE_SERVICE_ROLE_KEY']
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
supabase_admin: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_KEY)  # bypasses RLS

@app.route('/')
def landing():
    return send_from_directory('Food_land', 'index.html')

@app.route('/shop')
def shop():
    return send_from_directory('static', 'index.html')

# Serve Food_land CSS, JS, assets and contact page
@app.route('/css/<path:filename>')
def food_land_css(filename):
    return send_from_directory('Food_land/css', filename)

@app.route('/js/<path:filename>')
def food_land_js(filename):
    return send_from_directory('Food_land/js', filename)

@app.route('/assets/<path:filename>')
def food_land_assets(filename):
    return send_from_directory('Food_land/assets', filename)

@app.route('/contact.html')
def contact():
    return send_from_directory('Food_land', 'contact.html')

@app.route('/Foods/<path:filename>')
def serve_food_images(filename):
    return send_from_directory('Foods', filename)

# --- PRODUCT DETAIL PAGE ---
@app.route('/product/<product_id>')
def product_page(product_id):
    return send_from_directory('static', 'product.html')

@app.route('/api/product/<product_id>', methods=['GET'])
def get_product(product_id):
    try:
        food_res = supabase.table('foods').select('*').eq('id', product_id).execute()
        if not food_res.data:
            return jsonify({'status': 'error', 'message': 'Product not found'}), 404
        food = food_res.data[0]

        variant_res = supabase.table('food_variants').select('*').eq('food_id', product_id).limit(1).execute()
        image_res = supabase.table('food_images').select('*').eq('food_id', product_id).limit(1).execute()

        price = float(variant_res.data[0]['price']) if variant_res.data else 0.0
        image = image_res.data[0]['image_url'] if image_res.data else ''

        return jsonify({
            'id': food['id'],
            'name': food['name'],
            'description': food.get('description', ''),
            'price': price,
            'image': image,
            'is_available': food.get('is_available', True)
        })
    except Exception as e:
        print(f"Error fetching product {product_id}: {e}")
        return jsonify({'status': 'error', 'message': 'Product not found'}), 404

# Serve shopping page static files (style, script, landing)
@app.route('/<path:filename>')
def serve_static(filename):
    return send_from_directory('static', filename)

# --- MENU API ---
@app.route('/api/foods', methods=['GET'])
def get_foods():
    try:
        # Fetch foods where is_available is true (optional, depends on schema defaults)
        foods_res = supabase.table('foods').select('*').execute()
        foods = foods_res.data
        
        # Fetch variants and images
        variants_res = supabase.table('food_variants').select('*').execute()
        images_res = supabase.table('food_images').select('*').execute()
        
        variants = {v['food_id']: v for v in variants_res.data}
        images = {i['food_id']: i for i in images_res.data}
        
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
            
        formatted_foods.sort(key=lambda x: x['name'])
        return jsonify(formatted_foods)
    except Exception as e:
        print(f"Error fetching foods: {e}")
        return jsonify([])

# --- AUTHENTICATION API ---
@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.json
    try:
        # Check users_profile first — avoids consuming a Supabase Auth rate-limit slot
        existing = supabase.table('users_profile').select('id').eq('email', data['email']).execute()
        if existing.data:
            return jsonify({"status": "user_exists", "message": "User already exists. Please log in instead."}), 409

        res = supabase.auth.sign_up({
            "email": data['email'],
            "password": data['password']
        })
        
        # Supabase returns a user with an empty identities list when the email already exists
        identities = getattr(res.user, 'identities', None) if res.user else None
        if res.user and identities is not None and len(identities) == 0:
            return jsonify({"status": "user_exists", "message": "User already exists. Please log in instead."}), 409
        
        if res.user:
            supabase_admin.table('users_profile').insert({
                'id': res.user.id,
                'email': data['email'],
                'name': data.get('name', 'User')
            }).execute()
            
            return jsonify({
                "status": "success", 
                "message": "Account created! Welcome aboard!", 
                "user": {"id": res.user.id, "name": data.get('name', 'User'), "email": data['email']}
            })
        else:
            return jsonify({"status": "error", "message": "Signup failed"}), 400
    except Exception as e:
        error_msg = str(e).lower()
        if 'already registered' in error_msg or 'already exists' in error_msg or 'user already' in error_msg:
            return jsonify({"status": "user_exists", "message": "User already exists. Please log in instead."}), 409
        print(f"Signup error: {e}")
        return jsonify({"status": "error", "message": str(e)}), 400

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    try:
        res = supabase.auth.sign_in_with_password({
            "email": data['email'],
            "password": data['password']
        })
        
        if res.user:
            profile_res = supabase.table('users_profile').select('name, is_admin').eq('id', res.user.id).execute()
            profile = profile_res.data[0] if profile_res.data else {}
            name = profile.get('name') or data['email']
            is_admin = profile.get('is_admin', False)
                
            return jsonify({
                "status": "success", 
                "message": "Login successful", 
                "user": {"id": res.user.id, "name": name, "email": data['email'], "isAdmin": is_admin}
            })
        else:
            return jsonify({"status": "error", "message": "Invalid credentials"}), 401
    except Exception as e:
        print(f"Login error: {e}")
        return jsonify({"status": "error", "message": "Invalid credentials"}), 401

# --- ORDERS API ---
@app.route('/api/checkout', methods=['POST'])
def checkout():
    data = request.json
    try:
        # Create Order
        user_id = data.get('user_id') # If client provided user_id
        
        order_res = supabase.table('orders').insert({
            'user_id': user_id if user_id else None,
            'total_amount': float(data['total']),
            'status': 'Pending'
        }).execute()
        
        order_id = order_res.data[0]['id']
        
        # We need to link the order items to the specific variant ID
        # Since we modified the frontend, we don't have variants explicitly selected.
        # We'll fetch the default variants for the ordered foods.
        food_ids = [item['id'] for item in data['items']]
        variants_res = supabase.table('food_variants').select('*').in_('food_id', food_ids).execute()
        variant_map = {v['food_id']: v['id'] for v in variants_res.data}
        
        order_items_data = []
        for item in data['items']:
            order_items_data.append({
                'order_id': order_id,
                'food_id': item['id'],
                'variant_id': variant_map.get(item['id']),
                'quantity': item['quantity'],
                'price': float(item['price'])
            })
            
        supabase.table('order_items').insert(order_items_data).execute()
        
        return jsonify({"status": "success", "message": "Order placed successfully!", "order_id": order_id})
    except Exception as e:
        print(f"Checkout error: {e}")
        return jsonify({"status": "error", "message": "Failed to place order"}), 500

@app.route('/api/orders/<order_id>', methods=['GET'])
def get_order(order_id):
    try:
        order_res = supabase.table('orders').select('*').eq('id', order_id).execute()
        if not order_res.data:
            return jsonify({"status": "error", "message": "Order not found"}), 404
            
        return jsonify({"status": "success", "order": {
            "id": order_res.data[0]['id'],
            "status": order_res.data[0]['status'],
            "total": float(order_res.data[0]['total_amount'] or 0)
        }})
    except Exception as e:
        print(f"Fetch order error: {e}")
        return jsonify({"status": "error", "message": "Invalid Order ID"}), 400

if __name__ == '__main__':
    app.run(debug=True, port=5000)