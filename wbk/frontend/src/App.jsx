import { BrowserRouter, Routes, Route, Link } from "react-router";
import FsmApp from "./FSM/FsmApp.jsx";
import './App.scss';

export default function App() {
  return (
    <BrowserRouter>
      {/* <div className="App"> */}
        <nav className="__nav">
          <Link to="/">Home</Link>
          <Link to="/fsm">FSM</Link>
        </nav>
        <Routes>
          <Route path="/fsm" element={<FsmApp />} />
          <Route path="/" element={<div>Sweet</div>} />
        </Routes>
      {/* </div> */}
    </BrowserRouter>
  );
}
