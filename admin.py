from flask import Flask, jsonify, request, send_from_directory
import json
import os
import uuid
from supabase import create_client, Client
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='admin_static', static_url_path='')

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
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
        # Fetch only available foods
        foods_res = supabase.table('foods').select('*').eq('is_available', True).execute()
        foods = foods_res.data

        # Fetch variants and images
        variants_res = supabase.table('food_variants').select('*').execute()
        images_res = supabase.table('food_images').select('*').execute()

        variants = {v['food_id']: v for v in variants_res.data}

        # Group images by food_id
        images_by_food = {}
        for img in images_res.data:
            fid = img['food_id']
            if fid not in images_by_food:
                images_by_food[fid] = []
            images_by_food[fid].append(img['image_url'])

        # Format for frontend
        formatted_foods = []
        for f in foods:
            food_id = f['id']
            # Fallback to placeholder if no images
            food_images = images_by_food.get(food_id, ['Foods/placeholder.jpg'])
            formatted_foods.append({
                'id': food_id,
                'name': f['name'],
                'description': f.get('description', ''),
                'price': variants.get(food_id, {}).get('price', 0),
                'image': food_images[0], # Primary image for listing
                'images': food_images # Full array for editing
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
        
        # Insert Images
        images = data.get('images', [])
        if not images:
            # Fallback if they sent a single image or nothing
            single = data.get('image')
            images = [single] if single else ['Foods/placeholder.jpg']

        image_data = []
        for img_url in images:
            image_data.append({
                'food_id': food_id,
                'image_url': img_url
            })
        
        if image_data:
            supabase.table('food_images').insert(image_data).execute()
        
        # Return formatted new food
        new_food = {
            'id': food_id,
            'name': data['name'],
            'description': data.get('description', ''),
            'price': float(data['price']),
            'image': images[0] if images else 'Foods/placeholder.jpg',
            'images': images
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
            
        # Update Images: To keep it clean, delete existing ones and re-insert the provided array
        if 'images' in data:
            images = data['images']
            # Delete old images
            supabase.table('food_images').delete().eq('food_id', food_id).execute()
            
            # Insert new ones
            if images:
                image_data = [{'food_id': food_id, 'image_url': img} for img in images]
                supabase.table('food_images').insert(image_data).execute()
        elif 'image' in data:
            # Fallback for old single image updates from elsewhere if they happen
            supabase.table('food_images').delete().eq('food_id', food_id).execute()
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
        print(f"Delete request for food_id: {food_id}")

        # Verify food exists first
        food_check = supabase.table('foods').select('id').eq('id', food_id).execute()
        if not food_check.data:
            print(f"Food not found: {food_id}")
            return jsonify({"status": "error", "message": "Food item not found"}), 404

        # 1. Delete food images
        supabase.table('food_images').delete().eq('food_id', food_id).execute()
        print(f"Deleted images for food_id: {food_id}")

        # 2. Delete food variants (will fail if referenced by orders - catch and handle)
        try:
            supabase.table('food_variants').delete().eq('food_id', food_id).execute()
            print(f"Deleted variants for food_id: {food_id}")
        except Exception as variant_error:
            # If FK constraint prevents deletion, it means this food is in active orders
            # In this case, just mark as unavailable instead
            if '23503' in str(variant_error):
                print(f"Food referenced by orders, marking unavailable instead: {food_id}")
                supabase.table('foods').update({'is_available': False}).eq('id', food_id).execute()
                return jsonify({
                    "status": "success",
                    "message": "Food marked unavailable (has existing orders). Will be hidden from menu."
                })
            else:
                raise

        # 3. Finally delete the food itself
        supabase.table('foods').delete().eq('id', food_id).execute()
        print(f"Successfully deleted food: {food_id}")

        return jsonify({"status": "success", "message": "Food completely removed!"})

    except Exception as e:
        print(f"Error deleting food {food_id}: {type(e).__name__}: {str(e)}")
        return jsonify({"status": "error", "message": "Failed to delete food"}), 500

# --- ORDERS API ---
@app.route('/api/orders', methods=['GET'])
def get_orders():
    try:
        from datetime import datetime, timedelta

        # Fetch orders with all required fields
        orders_res = supabase.table('orders').select('*').order('created_at', desc=True).execute()
        orders = orders_res.data

        # Manually fetch user profiles for the linked user_ids
        user_ids = list({o['user_id'] for o in orders if o.get('user_id')})
        profiles = {}
        if user_ids:
            profiles_res = supabase.table('users_profile').select('id, email, name, phone, address').in_('id', user_ids).execute()
            profiles = {p['id']: p for p in profiles_res.data}

        # Fetch items
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

        # Apply query parameters for filtering
        status_filter = request.args.get('status')
        search_query = request.args.get('search', '').lower()
        date_from = request.args.get('date_from')
        date_to = request.args.get('date_to')
        sort_by = request.args.get('sort_by', 'date')  # 'date' or 'amount'

        formatted_orders = []
        for o in orders:
            profile = profiles.get(o.get('user_id')) or {}
            customer_name = profile.get('name') or profile.get('email') or 'Guest'

            # Apply filters
            if status_filter and o.get('status') != status_filter:
                continue

            if search_query:
                search_in = (customer_name + profile.get('email', '') + o['id']).lower()
                if search_query not in search_in:
                    continue

            if date_from or date_to:
                order_date = o.get('created_at', '')[:10] if o.get('created_at') else ''
                if date_from and order_date < date_from:
                    continue
                if date_to and order_date > date_to:
                    continue

            formatted_orders.append({
                'id': o['id'],
                'customer': customer_name,
                'phone': profile.get('phone') or 'N/A',
                'address': profile.get('address') or 'N/A',
                'items': items_by_order.get(o['id'], []),
                'total': float(o['total_amount'] or 0),
                'status': o['status'],
                'created_at': o.get('created_at'),
                'user_id': o.get('user_id')
            })

        # Apply sorting
        if sort_by == 'amount':
            formatted_orders.sort(key=lambda x: x['total'], reverse=True)
        else:
            formatted_orders.sort(key=lambda x: x['created_at'] or '', reverse=True)

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

@app.route('/api/orders/<order_id>/details', methods=['GET'])
def get_order_details(order_id):
    try:
        # Fetch order
        order_res = supabase.table('orders').select('*').eq('id', order_id).execute()
        if not order_res.data:
            return jsonify({"status": "error", "message": "Order not found"}), 404

        order = order_res.data[0]

        # Fetch user profile
        profile = {}
        if order.get('user_id'):
            profile_res = supabase.table('users_profile').select('*').eq('id', order.get('user_id')).execute()
            if profile_res.data:
                profile = profile_res.data[0]

        # Fetch order items with food details
        items_res = supabase.table('order_items').select('*, foods(id, name, description), food_variants(variant_name)').eq('order_id', order_id).execute()
        items = []
        for item in items_res.data:
            items.append({
                'id': item['id'],
                'food_id': item['food_id'],
                'name': item['foods']['name'] if item.get('foods') else 'Unknown Item',
                'description': item['foods'].get('description', '') if item.get('foods') else '',
                'quantity': item['quantity'],
                'price': float(item['price']),
                'variant': item['food_variants'].get('variant_name', 'Default') if item.get('food_variants') else 'Default'
            })

        return jsonify({
            'status': 'success',
            'order': {
                'id': order['id'],
                'status': order['status'],
                'total': float(order['total_amount'] or 0),
                'created_at': order.get('created_at'),
                'customer': {
                    'name': profile.get('name', 'Guest'),
                    'email': profile.get('email', 'N/A'),
                    'phone': profile.get('phone', 'N/A'),
                    'address': profile.get('address', 'N/A')
                },
                'items': items
            }
        })
    except Exception as e:
        print(f"Error fetching order details {order_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to fetch order details"}), 500

@app.route('/api/orders/<order_id>', methods=['DELETE'])
def delete_order(order_id):
    try:
        # Verify order exists
        order_res = supabase.table('orders').select('id, status').eq('id', order_id).execute()
        if not order_res.data:
            return jsonify({"status": "error", "message": "Order not found"}), 404

        order = order_res.data[0]

        # Only allow deletion of completed orders (Cancelled or Delivered)
        if order['status'] not in ('Cancelled', 'Delivered'):
            return jsonify({
                "status": "error",
                "message": f"Can only delete Cancelled or Delivered orders. This order is {order['status']}"
            }), 400

        # Delete order items first (cascade won't work for this simple delete)
        supabase.table('order_items').delete().eq('order_id', order_id).execute()

        # Delete the order
        supabase.table('orders').delete().eq('id', order_id).execute()

        return jsonify({"status": "success", "message": f"Order {order_id} deleted successfully"})
    except Exception as e:
        print(f"Error deleting order {order_id}: {e}")
        return jsonify({"status": "error", "message": "Failed to delete order"}), 500

# --- STATS API ---
@app.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        from datetime import datetime, date

        # Fetch all orders with details
        orders_res = supabase.table('orders').select('id, total_amount, status, created_at, user_id').execute()
        orders = orders_res.data

        # Fetch available foods only
        foods_res = supabase.table('foods').select('id').eq('is_available', True).execute()

        # Fetch all order items for popular items calculation
        items_res = supabase.table('order_items').select('food_id, quantity').execute()
        order_items = items_res.data

        # Fetch user profiles for top customers
        user_ids = list({o['user_id'] for o in orders if o.get('user_id')})
        profiles = {}
        if user_ids:
            profiles_res = supabase.table('users_profile').select('id, name, email').in_('id', user_ids).execute()
            profiles = {p['id']: p for p in profiles_res.data}

        # Basic counts
        total_orders = len(orders)
        total_items = len(foods_res.data) if foods_res.data else 0

        # Revenue calculations
        total_revenue = sum(float(o.get('total_amount') or 0) for o in orders)
        avg_order_value = total_revenue / total_orders if total_orders > 0 else 0

        # Today's revenue
        today = date.today().isoformat()
        today_revenue = 0
        for o in orders:
            if o.get('created_at'):
                order_date = o['created_at'][:10]  # Extract YYYY-MM-DD
                if order_date == today:
                    today_revenue += float(o.get('total_amount') or 0)

        # Status breakdown
        status_breakdown = {}
        for o in orders:
            status = o.get('status', 'Unknown')
            status_breakdown[status] = status_breakdown.get(status, 0) + 1

        # Popular items (top 5 by quantity)
        items_count = {}
        items_names = {}
        for item in order_items:
            food_id = item.get('food_id')
            quantity = item.get('quantity', 0)
            if food_id:
                items_count[food_id] = items_count.get(food_id, 0) + quantity

        # Get food names for top items
        if items_count:
            top_food_ids = sorted(items_count.items(), key=lambda x: x[1], reverse=True)[:5]
            top_food_ids_list = [fid for fid, _ in top_food_ids]
            if top_food_ids_list:
                foods_detail = supabase.table('foods').select('id, name').in_('id', top_food_ids_list).execute()
                items_names = {f['id']: f['name'] for f in foods_detail.data}

        popular_items = [
            {
                'name': items_names.get(fid, 'Unknown'),
                'quantity': qty
            }
            for fid, qty in sorted(items_count.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        # Top customers (by order count)
        customer_orders = {}
        for o in orders:
            user_id = o.get('user_id')
            if user_id:
                customer_orders[user_id] = customer_orders.get(user_id, 0) + 1

        top_customers = [
            {
                'name': profiles.get(uid, {}).get('name', profiles.get(uid, {}).get('email', 'Unknown')),
                'orders': count
            }
            for uid, count in sorted(customer_orders.items(), key=lambda x: x[1], reverse=True)[:5]
        ]

        return jsonify({
            "orders": total_orders,
            "pending": status_breakdown.get('Waiting Approval', 0) + status_breakdown.get('Pending', 0),
            "approved": status_breakdown.get('Approved', 0),
            "items": total_items,
            "total_revenue": round(total_revenue, 2),
            "today_revenue": round(today_revenue, 2),
            "avg_order_value": round(avg_order_value, 2),
            "status_breakdown": status_breakdown,
            "popular_items": popular_items,
            "top_customers": top_customers
        })
    except Exception as e:
        print(f"Error fetching stats: {e}")
        return jsonify({
            "orders": 0, "pending": 0, "approved": 0, "items": 0,
            "total_revenue": 0, "today_revenue": 0, "avg_order_value": 0,
            "status_breakdown": {}, "popular_items": [], "top_customers": []
        })

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5001))
    app.run(debug=False, host='0.0.0.0', port=port)
