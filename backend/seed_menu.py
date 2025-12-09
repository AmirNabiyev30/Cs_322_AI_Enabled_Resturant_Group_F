# backend/seed_menu.py

from app import create_app
from extensions import db
from models import Dish, User


# --- 1) Define chefs (employees) ---

CHEFS = [
    {
        "name": "Chef Marco",
        "email": "chef.marco@example.com",
        "password": "password123",  # simple for demo; you can change
    },
    {
        "name": "Chef Hana",
        "email": "chef.hana@example.com",
        "password": "password123",
    },
]


# --- 2) Define menu dishes, each tied to a chef by email ---

MENU_DISHES = [
    {
        "name": "Spicy Ramen",
        "description": "Rich pork broth with chili oil, soft-boiled egg, and green onions.",
        "price": 14.50,
        "image_url": "/dishes/spicy-ramen.jpg",
        "is_vip_only": False,
        "chef_email": "chef.marco@example.com",
    },
    {
        "name": "Dragon Fire Wings",
        "description": "Crispy wings tossed in extra-hot house sauce with cooling ranch.",
        "price": 12.00,
        "image_url": "/dishes/dragon-fire-wings.jpg",
        "is_vip_only": False,
        "chef_email": "chef.marco@example.com",
    },
    {
        "name": "VIP Wagyu Bento",
        "description": "Premium wagyu beef slices, rice, pickles, and miso soup. VIP only.",
        "price": 38.00,
        "image_url": "/dishes/ratatouille.jpg",
        "is_vip_only": True,
        "chef_email": "chef.hana@example.com",
    },
    {
        "name": "Vegan Buddha Bowl",
        "description": "Quinoa, roasted veggies, chickpeas, and tahini dressing.",
        "price": 16.00,
        "image_url": "/dishes/vegan-buddha-bowl.jpg",
        "is_vip_only": False,
        "chef_email": "chef.hana@example.com",
    },
    {
        "name": "Mango Mochi Dessert",
        "description": "Soft mochi filled with mango ice cream.",
        "price": 7.50,
        "image_url": "/dishes/mango-mochi.jpg",
        "is_vip_only": False,
        "chef_email": "chef.marco@example.com",
    },  
]


DELIVERY_PEOPLE = [
    {
        "name": "Courier Aisha",
        "email": "courier.aisha@example.com",
        "password": "password123",  # simple for demo
    },
    {
        "name": "Courier Leo",
        "email": "courier.leo@example.com",
        "password": "password123",
    },
]



def sync_menu_and_chefs():
    app = create_app()

    with app.app_context():
        print("Syncing chefs (employees)...")

        # 1) Ensure chef users exist
        chef_by_email = {}
        for chef_data in CHEFS:
            email = chef_data["email"]
            chef = User.query.filter_by(email=email).first()
            if chef:
                chef.role = "chef"
                chef_by_email[email] = chef
                print(f"Found existing chef: {chef.name} ({email})")
            else:
                chef = User(
                    name=chef_data["name"],
                    email=email,
                    role="chef",
                )
                if hasattr(chef, "set_password"):
                    chef.set_password(chef_data["password"])
                else:
                    from werkzeug.security import generate_password_hash

                    chef.password_hash = generate_password_hash(
                        chef_data["password"]
                    )

                db.session.add(chef)
                chef_by_email[email] = chef
                print(f"Created new chef: {chef.name} ({email})")

        # 2) Ensure delivery people exist
        print("\nSyncing delivery people (couriers)...")
        for d_data in DELIVERY_PEOPLE:
            email = d_data["email"]
            courier = User.query.filter_by(email=email).first()
            if courier:
                courier.role = "courier"
                print(f"Found existing courier: {courier.name} ({email})")
            else:
                courier = User(
                    name=d_data["name"],
                    email=email,
                    role="courier",  # 👈 important
                )
                if hasattr(courier, "set_password"):
                    courier.set_password(d_data["password"])
                else:
                    from werkzeug.security import generate_password_hash

                    courier.password_hash = generate_password_hash(
                        d_data["password"]
                    )

                db.session.add(courier)
                print(f"Created new courier: {courier.name} ({email})")

        db.session.flush()  # ensure IDs are assigned for chefs

        print("\nSyncing menu dishes...")
        existing_dishes = {d.name: d for d in Dish.query.all()}
        seen_names = set()

        for data in MENU_DISHES:
            name = data["name"]
            seen_names.add(name)

            chef_email = data.get("chef_email")
            chef = chef_by_email.get(chef_email)

            if name in existing_dishes:
                dish = existing_dishes[name]
                dish.description = data["description"]
                dish.price = data["price"]
                dish.image_url = data.get("image_url")
                dish.is_vip_only = data.get("is_vip_only", False)
                if chef:
                    dish.chef_id = chef.id
                print(
                    f"Updated dish: {name} (chef={chef.name if chef else 'None'})"
                )
            else:
                dish = Dish(
                    name=name,
                    description=data["description"],
                    price=data["price"],
                    image_url=data.get("image_url"),
                    is_vip_only=data.get("is_vip_only", False),
                    chef_id=chef.id if chef else None,
                )
                db.session.add(dish)
                print(
                    f"Created dish: {name} (chef={chef.name if chef else 'None'})"
                )

        # Optional: clean up dishes not in MENU_DISHES
        for name, dish in existing_dishes.items():
            if name not in seen_names:
                print(f"Deleting dish no longer in MENU_DISHES: {name}")
                db.session.delete(dish)

        db.session.commit()
        print("\nMenu + chefs + couriers sync complete.")


if __name__ == "__main__":
    sync_menu_and_chefs()