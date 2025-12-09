// src/pages/DiscussionPage.jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client";
import { getCurrentUser } from "../auth/user";

function DiscussionPage() {
  const [currentUser, setCurrentUser] = useState(null);

  const [topics, setTopics] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // creating a new topic
  const [newCategory, setNewCategory] = useState("general"); // chef | dish | delivery | general
  const [newTitle, setNewTitle] = useState("");
  const [newBody, setNewBody] = useState("");
  const [creating, setCreating] = useState(false);

  // replying
  const [replyText, setReplyText] = useState({});
  const [replyLoadingId, setReplyLoadingId] = useState(null);

  useEffect(() => {
    const user = getCurrentUser();
    setCurrentUser(user);
    fetchTopics();
  }, []);

  async function fetchTopics() {
    setError("");
    setLoading(true);
    try {
      // adjust to your backend route if needed, e.g. "/discussion/topics"
      const res = await api.get("/discussion/topics");
      setTopics(res.data || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load discussion topics.");
    } finally {
      setLoading(false);
    }
  }

  function canPost() {
    if (!currentUser) return false;
    return ["customer", "vip", "delivery", "courier"].includes(
      currentUser.role
    );
  }

  async function handleCreateTopic(e) {
    e.preventDefault();
    if (!currentUser) {
      setError("You must be logged in to start a discussion.");
      return;
    }
    if (!canPost()) {
      setError("Your role is not allowed to start topics.");
      return;
    }
    if (!newTitle.trim() || !newBody.trim()) {
      setError("Please provide both a title and content.");
      return;
    }

    setError("");
    setCreating(true);

    try {
      // This assumes a backend route like POST /api/discussion/topics
      // Body shape: adjust if your backend expects different keys
      await api.post("/discussion/topics", {
        starter_id: currentUser.id,
        category: newCategory, // "chef", "dish", "delivery", "general"
        title: newTitle.trim(),
        body: newBody.trim(),
      });

      setNewTitle("");
      setNewBody("");
      setNewCategory("general");
      await fetchTopics();
    } catch (err) {
      console.error(err);
      setError(
        err.response?.data?.error || "Failed to create discussion topic."
      );
    } finally {
      setCreating(false);
    }
  }

  async function handleReply(topicId) {
    if (!currentUser) {
      setError("You must be logged in to reply.");
      return;
    }
    if (!canPost()) {
      setError("Your role is not allowed to reply.");
      return;
    }

    const text = (replyText[topicId] || "").trim();
    if (!text) {
      setError("Please write a reply before submitting.");
      return;
    }

    setError("");
    setReplyLoadingId(topicId);

    try {
      // assumes POST /api/discussion/topics/<id>/posts
      await api.post(`/discussion/topics/${topicId}/posts`, {
        author_id: currentUser.id,
        body: text,
      });

      setReplyText((prev) => ({ ...prev, [topicId]: "" }));
      await fetchTopics();
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || "Failed to submit reply.");
    } finally {
      setReplyLoadingId(null);
    }
  }

  function categoryLabel(cat) {
    switch (cat) {
      case "chef":
        return "Chef";
      case "dish":
        return "Dish";
      case "delivery":
        return "Delivery";
      default:
        return "General";
    }
  }

  if (!currentUser) {
    return (
      <div style={{ padding: "1.5rem" }}>
        <h2>Discussion Forum</h2>
        <p>You must be logged in to view and participate in discussions.</p>
        <Link to="/login">Go to Login</Link>
      </div>
    );
  }

  return (
    <div style={{ padding: "1.5rem", maxWidth: "1000px", margin: "0 auto" }}>
      <h2>Discussion Forum</h2>
      <p style={{ maxWidth: "650px", color: "#555" }}>
        Registered customers and VIPs can start or participate in discussion
        topics about <strong>chefs</strong>, <strong>dishes</strong>, and{" "}
        <strong>delivery people</strong>. Delivery staff can also share their
        perspective about customers they&apos;ve served.
      </p>

      {error && (
        <p style={{ color: "red", marginBottom: "0.5rem" }}>Error: {error}</p>
      )}

      {/* New topic form */}
      {canPost() && (
        <section
          style={{
            marginTop: "1rem",
            marginBottom: "1.5rem",
            padding: "1rem",
            borderRadius: "8px",
            border: "1px solid #dee2e6",
            backgroundColor: "#f8f9fa",
          }}
        >
          <h3 style={{ marginTop: 0 }}>Start a new topic</h3>
          <form onSubmit={handleCreateTopic}>
            <div
              style={{
                display: "flex",
                gap: "0.75rem",
                flexWrap: "wrap",
                marginBottom: "0.5rem",
              }}
            >
              <div>
                <label style={{ fontSize: "0.85rem" }}>Category</label>
                <br />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value)}
                  style={{ padding: "0.25rem 0.5rem" }}
                >
                  <option value="general">General</option>
                  <option value="chef">Chef</option>
                  <option value="dish">Dish</option>
                  <option value="delivery">Delivery</option>
                </select>
              </div>
              <div style={{ flex: 1, minWidth: "200px" }}>
                <label style={{ fontSize: "0.85rem" }}>Title</label>
                <br />
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  style={{ width: "100%", padding: "0.3rem" }}
                  placeholder="e.g., Amazing pasta from Chef Alex"
                />
              </div>
            </div>

            <div style={{ marginBottom: "0.5rem" }}>
              <label style={{ fontSize: "0.85rem" }}>Content</label>
              <br />
              <textarea
                value={newBody}
                onChange={(e) => setNewBody(e.target.value)}
                rows={3}
                style={{ width: "100%", padding: "0.4rem" }}
                placeholder="Share your thoughts about the dish, chef, or delivery experience..."
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              style={{
                padding: "0.4rem 0.9rem",
                borderRadius: "999px",
                border: "1px solid #0d6efd",
                backgroundColor: "#0d6efd",
                color: "#fff",
                cursor: creating ? "wait" : "pointer",
                fontSize: "0.9rem",
                fontWeight: 500,
              }}
            >
              {creating ? "Creating..." : "Post topic"}
            </button>
          </form>
        </section>
      )}

      {/* Topic list */}
      <section>
        <h3>Topics</h3>
        {loading ? (
          <p>Loading topics...</p>
        ) : topics.length === 0 ? (
          <p>No topics yet. Be the first to start one!</p>
        ) : (
          topics.map((topic) => {
            const posts = topic.posts || []; // defensive: in case backend doesn't include posts
            return (
              <div
                key={topic.id}
                style={{
                  border: "1px solid #dee2e6",
                  borderRadius: "8px",
                  padding: "0.75rem 1rem",
                  marginBottom: "0.8rem",
                  backgroundColor: "#ffffff",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: "0.75rem",
                  }}
                >
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <h4 style={{ margin: 0 }}>{topic.title}</h4>
                      <span
                        style={{
                          padding: "0.1rem 0.5rem",
                          borderRadius: "999px",
                          fontSize: "0.7rem",
                          backgroundColor: "#e7f5ff",
                          border: "1px solid #74c0fc",
                          color: "#0b7285",
                        }}
                      >
                        {categoryLabel(topic.category)}
                      </span>
                    </div>
                    <p
                      style={{
                        margin: "0.15rem 0 0.35rem 0",
                        fontSize: "0.8rem",
                        color: "#6c757d",
                      }}
                    >
                      Started by{" "}
                      <strong>{topic.starter_name || "Unknown"}</strong>{" "}
                      {topic.created_at &&
                        `on ${new Date(topic.created_at).toLocaleString()}`}
                    </p>
                  </div>
                  <div style={{ textAlign: "right", fontSize: "0.8rem" }}>
                    <div>
                      <strong>{posts.length}</strong> replies
                    </div>
                    {topic.target_display && (
                      <div style={{ color: "#495057" }}>
                        About: {topic.target_display}
                      </div>
                    )}
                  </div>
                </div>

                {/* Initial body */}
                {topic.body && (
                  <div
                    style={{
                      marginTop: "0.25rem",
                      padding: "0.4rem 0.6rem",
                      borderLeft: "3px solid #e9ecef",
                      backgroundColor: "#f8f9fa",
                      fontSize: "0.9rem",
                    }}
                  >
                    {topic.body}
                  </div>
                )}

                {/* Replies */}
                {posts.length > 0 && (
                  <div
                    style={{
                      marginTop: "0.5rem",
                      paddingTop: "0.4rem",
                      borderTop: "1px solid #f1f3f5",
                    }}
                  >
                    {posts.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          marginBottom: "0.35rem",
                          fontSize: "0.85rem",
                        }}
                      >
                        <span style={{ fontWeight: 600 }}>
                          {p.author_name || "User"}:
                        </span>{" "}
                        <span>{p.body}</span>
                        {p.created_at && (
                          <span
                            style={{
                              marginLeft: "0.4rem",
                              fontSize: "0.75rem",
                              color: "#868e96",
                            }}
                          >
                            {new Date(p.created_at).toLocaleString()}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Reply box */}
                {canPost() && (
                  <div
                    style={{
                      marginTop: "0.6rem",
                      paddingTop: "0.4rem",
                      borderTop: "1px dashed #dee2e6",
                    }}
                  >
                    <textarea
                      rows={2}
                      value={replyText[topic.id] || ""}
                      onChange={(e) =>
                        setReplyText((prev) => ({
                          ...prev,
                          [topic.id]: e.target.value,
                        }))
                      }
                      style={{
                        width: "100%",
                        padding: "0.35rem 0.45rem",
                        fontSize: "0.85rem",
                      }}
                      placeholder="Write a reply..."
                    />
                    <button
                      type="button"
                      onClick={() => handleReply(topic.id)}
                      disabled={replyLoadingId === topic.id}
                      style={{
                        marginTop: "0.35rem",
                        padding: "0.3rem 0.8rem",
                        borderRadius: "999px",
                        border: "1px solid #20c997",
                        backgroundColor: "#e6fcf5",
                        color: "#087f5b",
                        cursor:
                          replyLoadingId === topic.id ? "wait" : "pointer",
                        fontSize: "0.8rem",
                      }}
                    >
                      {replyLoadingId === topic.id ? "Posting..." : "Reply"}
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>
    </div>
  );
}

export default DiscussionPage;
