// src/pages/CartPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { getCurrentUser } from "../auth/user";

function CartPage({ cartItems, removeFromCart, clearCart }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [placingOrder, setPlacingOrder] = useState(false);
  const [error, setError] = useState("");
  const [orderResult, setOrderResult] = useState(null); // <-- pretty UI data

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
  }, []);

  const hasItems = cartItems.length > 0;
  const subtotal = cartItems.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  async function handlePlaceOrder() {
    setError("");
    setOrderResult(null);

    if (!currentUser) {
      setError("You must be logged in to place an order.");
      return;
    }

    if (!hasItems) {
      setError("Your cart is empty.");
      return;
    }

    const itemsPayload = cartItems.map((item) => ({
      dish_id: item.dish_id,
      quantity: item.quantity,
    }));

    setPlacingOrder(true);

    try {
      // Adjust path if your backend uses a slightly different URL
      const res = await api.post("/orders/", {
        user_id: currentUser.id,
        items: itemsPayload,
      });

      // Store the whole JSON so we can render it nicely
      setOrderResult(res.data);

      // Clear the cart
      clearCart();
    } catch (err) {
      console.error(err);
      if (err.response?.data?.error) {
        setError(err.response.data.error);
      } else {
        setError("Failed to place order. Please try again.");
      }
    } finally {
      setPlacingOrder(false);
    }
  }

  function addOne(item) {
    // We simply re-add the same dish (triggers your add-to-cart logic)
    const updated = {
      dish_id: item.dish_id,
      name: item.name,
      price: item.price,
      quantity: 1,
      is_vip_only: item.is_vip_only,
      image_url: item.image_url
    };
  
    // Reuse the addToCart-like behavior by updating state manually:
    const existing = cartItems.find((i) => i.dish_id === item.dish_id);
  
    if (existing) {
      const newCart = cartItems.map((i) =>
        i.dish_id === item.dish_id
          ? { ...i, quantity: i.quantity + 1 }
          : i
      );
      // Update state
      const event = new Event("cart-update");
      window.dispatchEvent(event);
      alert(`${item.name} +1`);
    }
  }
  

  return (
    <div style={{ padding: "1.5rem", maxWidth: "900px", margin: "0 auto" }}>
      <h2>Cart</h2>

      {!currentUser && (
        <p>
          You must be logged in to place an order.{" "}
          <Link to="/login">Go to Login</Link>
        </p>
      )}

      {error && (
        <p style={{ color: "red", marginBottom: "0.75rem" }}>Error: {error}</p>
      )}

      {/* Cart items */}
      {hasItems ? (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "8px",
            padding: "0.75rem 1rem",
            backgroundColor: "#fff",
            marginBottom: "1rem",
          }}
        >
          {cartItems.map((item) => (
            <div
              key={item.dish_id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "0.4rem 0",
                borderBottom: "1px solid #f1f3f5",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
                {item.image_url && (
                  <img
                    src={item.image_url}
                    alt={item.name}
                    style={{
                      width: "56px",
                      height: "56px",
                      borderRadius: "6px",
                      objectFit: "cover",
                    }}
                  />
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{item.name}</div>
                  <div style={{ fontSize: "0.85rem", color: "#495057" }}>
                    ${item.price.toFixed(2)} × {item.quantity}
                  </div>
                  {item.is_vip_only && (
                    <span
                      style={{
                        marginTop: "0.15rem",
                        display: "inline-block",
                        padding: "0.1rem 0.45rem",
                        borderRadius: "999px",
                        backgroundColor: "#fff3bf",
                        color: "#856404",
                        fontSize: "0.7rem",
                        border: "1px solid #ffe066",
                      }}
                    >
                      VIP dish
                    </span>
                  )}
                </div>
              </div>

              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600 }}>
                  ${(item.price * item.quantity).toFixed(2)}
                </div>

                {/* Add one button (green) */}
                <button
                  type="button"
                  onClick={() => addOne(item)} // you will define addOne below
                  style={{
                    marginTop: "0.25rem",
                    fontSize: "0.8rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "999px",
                    border: "1px solid #198754",
                    backgroundColor: "#d1f7e3",
                    color: "#0f5132",
                    cursor: "pointer",
                    marginRight: "0.35rem",
                  }}
                >
                  Add one
                </button>

                {/* Remove one button (red) */}
                <button
                  type="button"
                  onClick={() => removeFromCart(item.dish_id)}
                  style={{
                    marginTop: "0.25rem",
                    fontSize: "0.8rem",
                    padding: "0.15rem 0.5rem",
                    borderRadius: "999px",
                    border: "1px solid #dc3545",
                    backgroundColor: "#f8d7da",
                    color: "#842029",
                    cursor: "pointer",
                  }}
                >
                  Remove one
                </button>
              </div>

            </div>
          ))}

          <div
            style={{
              marginTop: "0.75rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              fontWeight: 600,
            }}
          >
            <span>Subtotal:</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
        </div>
      ) : (
        <p>Your cart is empty.</p>
      )}

      {/* Actions */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem" }}>
        <button
          type="button"
          onClick={handlePlaceOrder}
          disabled={!hasItems || !currentUser || placingOrder}
          style={{
            padding: "0.45rem 1rem",
            borderRadius: "999px",
            border: "none",
            backgroundColor: !hasItems || !currentUser ? "#adb5bd" : "#0d6efd",
            color: "white",
            cursor:
              !hasItems || !currentUser ? "not-allowed" : "pointer",
            fontWeight: 500,
          }}
        >
          {placingOrder ? "Placing order..." : "Place order"}
        </button>

        {hasItems && (
          <button
            type="button"
            onClick={clearCart}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "999px",
              border: "1px solid #ced4da",
              backgroundColor: "#f8f9fa",
              cursor: "pointer",
            }}
          >
            Clear cart
          </button>
        )}
      </div>

      {/* Pretty order summary UI instead of raw JSON */}
      {orderResult && (
        <div
          style={{
            borderRadius: "10px",
            border: "1px solid #51cf66",
            background:
              "linear-gradient(135deg, #e6fcf5 0%, #d3f9d8 50%, #f8fff0 100%)",
            padding: "1rem 1.25rem",
            boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "0.5rem",
              alignItems: "center",
            }}
          >
            <div>
              <h3 style={{ margin: 0 }}>Order confirmed ✅</h3>
              <p style={{ margin: 0, fontSize: "0.9rem", color: "#495057" }}>
                Thank you for your order! A delivery job has been created and
                a courier can now bid on it.
              </p>
            </div>
            {orderResult.vip_status?.role === "vip" && (
              <div
                style={{
                  padding: "0.2rem 0.7rem",
                  borderRadius: "999px",
                  backgroundColor: "#fff3bf",
                  border: "1px solid #ffe066",
                  fontSize: "0.8rem",
                  color: "#856404",
                  fontWeight: 600,
                }}
              >
                ⭐ VIP {orderResult.vip_status.just_promoted && " (New!)"}
              </div>
            )}
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr",
              gap: "0.75rem",
              alignItems: "flex-start",
            }}
          >
            {/* Left: order details */}
            <div>
              <p style={{ margin: "0 0 0.25rem 0" }}>
                <strong>Order #:</strong> {orderResult.order.id}
              </p>
              <p style={{ margin: "0 0 0.25rem 0" }}>
                <strong>Status:</strong> {orderResult.order.status}
              </p>
              <p style={{ margin: "0 0 0.35rem 0" }}>
                <strong>Amount:</strong>{" "}
                ${orderResult.order.total.toFixed(2)}
                {orderResult.order.discount > 0 && (
                  <span style={{ fontSize: "0.85rem", color: "#0b7285" }}>
                    {" "}
                    (saved ${orderResult.order.discount.toFixed(2)} as VIP)
                  </span>
                )}
              </p>

              <div style={{ marginTop: "0.4rem" }}>
                <strong>Items:</strong>
                <ul
                  style={{
                    margin: "0.25rem 0 0",
                    paddingLeft: "1.1rem",
                    fontSize: "0.9rem",
                  }}
                >
                  {orderResult.order.items.map((it, idx) => (
                    <li key={idx}>
                      Dish #{it.dish_id} &times; {it.quantity} — $
                      {it.unit_price.toFixed(2)} each
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right: account & balance */}
            <div
              style={{
                padding: "0.5rem 0.75rem",
                borderRadius: "8px",
                backgroundColor: "#ffffffaa",
                border: "1px dashed #ced4da",
                fontSize: "0.9rem",
              }}
            >
              <p style={{ margin: "0 0 0.25rem 0" }}>
                <strong>New balance:</strong>{" "}
                ${orderResult.user_balance.toFixed(2)}
              </p>
              <p style={{ margin: 0 }}>
                <strong>Your role:</strong>{" "}
                {orderResult.vip_status?.role || "customer"}
              </p>
              {orderResult.vip_status?.just_promoted && (
                <p
                  style={{
                    margin: "0.35rem 0 0 0",
                    fontSize: "0.85rem",
                    color: "#087f5b",
                  }}
                >
                  🎉 You’ve just been promoted to VIP! You now get 5% discount
                  on future orders and 1 free delivery every 3 orders.
                </p>
              )}
            </div>
          </div>

          <div
            style={{
              marginTop: "0.75rem",
              fontSize: "0.85rem",
              color: "#495057",
            }}
          >
            You can review this order and rate food & delivery later on the{" "}
            <Link to="/my-orders">My Orders</Link> page.
          </div>
        </div>
      )}
    </div>
  );
}

export default CartPage;
