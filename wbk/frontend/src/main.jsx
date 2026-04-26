import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";

const $root = document.getElementById("root");
$root.classList.add('App');

ReactDOM.createRoot($root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
