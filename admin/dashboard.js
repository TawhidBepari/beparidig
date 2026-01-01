async function verifySession() {
  const token = localStorage.getItem("admin_token");

  if (!token) {
    window.location.href = "/admin/login.html";
    return;
  }

  const res = await fetch(
    "/.netlify/functions/admin-verify-session?token=" + encodeURIComponent(token),
    { cache: "no-store" }
  );

  const data = await res.json();

  if (!data.valid) {
    localStorage.removeItem("admin_token");
    window.location.href = "/admin/login.html";
    return;
  }

  document.getElementById("adminUser").textContent = data.admin_email;
}

verifySession();

document.getElementById("logout").onclick = () => {
  localStorage.removeItem("admin_token");
  window.location.href = "/admin/login.html";
};
