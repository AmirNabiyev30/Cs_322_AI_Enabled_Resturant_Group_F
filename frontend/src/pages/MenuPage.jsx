import { useEffect, useState } from "react";
import api from "../api/client";
import { getCurrentUser } from "../auth/user";

function MenuPage({ onAddToCart }) {
  const [dishes, setDishes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);

    async function fetchMenu() {
      try {
        const res = await api.get("/menu/");
        setDishes(res.data.dishes || []);
      } catch (err) {
        console.error(err);
        setError("Failed to load menu.");
      } finally {
        setLoading(false);
      }
    }

    fetchMenu();
  }, []);

  if (loading) {
    return <div style={{ padding: "1.5rem" }}>Loading menu...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: "1.5rem", color: "red" }}>
        Error: {error}
      </div>
    );
  }

  const isVip = currentUser?.role === "vip";

  return (
    <div style={{ padding: "1.5rem" }}>
      {/* Header row with VIP badge if applicable */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.75rem",
          marginBottom: "0.5rem",
        }}
      >
        <h2 style={{ margin: 0 }}>Menu</h2>

        {isVip && (
          <span
            style={{
              padding: "0.2rem 0.6rem",
              borderRadius: "999px",
              backgroundColor: "#fff3bf",   // soft yellow
              color: "#856404",              // dark golden
              fontSize: "0.8rem",
              fontWeight: 600,
              border: "1px solid #ffe066",
            }}
          >
            ⭐ VIP Customer
          </span>
        )}
      </div>

      {/* Info text */}
      {isVip ? (
        <p style={{ color: "#0b7285", marginTop: "0.25rem" }}>
          You are a <strong>VIP customer</strong>. You automatically get{" "}
          <strong>5% discount</strong> on orders and <strong>VIP-only dishes</strong> are unlocked for you.
        </p>
      ) : (
        <p style={{ color: "#555", marginTop: "0.25rem" }}>
          Some dishes are marked with a{" "}
          <span
            style={{
              padding: "0.1rem 0.45rem",
              borderRadius: "999px",
              backgroundColor: "#fff3bf",
              color: "#856404",
              fontSize: "0.75rem",
              fontWeight: 600,
              border: "1px solid #ffe066",
            }}
          >
            VIP
          </span>{" "}
          tag and are <strong>VIP-only</strong>. Spend over $100 or make 3
          complaint-free orders to be promoted to VIP.
        </p>
      )}

      {dishes.length === 0 ? (
        <p>No dishes yet.</p>
      ) : (
        <div style={{ display: "grid", gap: "1rem" }}>
          {dishes.map((dish) => {
            const isVipBlocked =
              dish.is_vip_only && (!currentUser || currentUser.role !== "vip");

            return (
              <div
                key={dish.id}
                style={{
                  border: "1px solid #ddd",
                  borderRadius: "8px",
                  padding: "0.75rem",
                  display: "flex",
                  gap: "0.75rem",
                  backgroundColor: "#fff",
                }}
              >
                {/* IMAGE */}
                {dish.image_url && (
                  <img
                    src={dish.image_url}
                    alt={dish.name}
                    style={{
                      width: "100px",
                      height: "100px",
                      objectFit: "cover",
                      borderRadius: "8px",
                      flexShrink: 0,
                    }}
                  />
                )}

                {/* TEXT */}
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "baseline",
                      gap: "0.5rem",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.35rem",
                        flexWrap: "wrap",
                      }}
                    >
                      <h3 style={{ margin: 0 }}>{dish.name}</h3>

                      {/* Yellow VIP tag on VIP dishes */}
                      {dish.is_vip_only && (
                        <span
                          style={{
                            padding: "0.1rem 0.45rem",
                            borderRadius: "999px",
                            backgroundColor: "#fff3bf",
                            color: "#856404",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            border: "1px solid #ffe066",
                            textTransform: "uppercase",
                          }}
                        >
                          VIP
                        </span>
                      )}
                    </div>

                    <span style={{ fontWeight: "bold" }}>
                      ${dish.price.toFixed(2)}
                    </span>
                  </div>

                  <p style={{ marginTop: "0.25rem" }}>{dish.description}</p>

                  {/* ADD TO CART (VIP SAFE) */}
                  <button
                    type="button"
                    onClick={() => onAddToCart(dish)}
                    disabled={isVipBlocked}
                    style={{
                      marginTop: "0.5rem",
                      padding: "0.3rem 0.7rem",
                      borderRadius: "999px",
                      border: isVipBlocked
                        ? "1px solid #aaa"
                        : "1px solid #0d6efd",
                      backgroundColor: isVipBlocked ? "#f1f3f5" : "#e7f1ff",
                      color: isVipBlocked ? "#868e96" : "#0d6efd",
                      cursor: isVipBlocked ? "not-allowed" : "pointer",
                      fontSize: "0.9rem",
                      fontWeight: 500,
                    }}
                  >
                    {isVipBlocked ? "VIP only" : "Add to cart"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default MenuPage;
