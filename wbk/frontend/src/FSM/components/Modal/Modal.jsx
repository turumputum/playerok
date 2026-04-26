import { MdClose } from "react-icons/md";
import { useEffect, useRef } from "react";
import "./Modal.scss";

const Modal = ({
  children,
  show,
  setShow,
  heading,
  dialogWidth = "25%",
  contentClassName = "",
  closeButton = true,
}) => {
  const modalRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      setShow(false);
    }
  };

  // Close modal when clicked outside of it
  const onClick = (event) => {
    const $dialog = modalRef.current;
    const rect = $dialog.getBoundingClientRect();
    const isInDialog = rect.top <= event.clientY && event.clientY <= rect.bottom &&
                      rect.left <= event.clientX && event.clientX <= rect.right;
    if (!isInDialog) {
      setShow(false);
    }
  }

  useEffect(() => {
    if (show) {
      modalRef.current.showModal();
    } else {
      modalRef.current.close();
    }
  }, [show]);


  return (
    <dialog
      ref={modalRef}
      className={`fm-modal dialog`}
      style={{ width: dialogWidth }}
      onKeyDown={handleKeyDown}
      onClick={onClick}
    >
      <div className="fm-modal-header">
        <span className="fm-modal-heading">{heading}</span>
        {closeButton && (
          <MdClose size={18} onClick={() => setShow(false)} className="close-icon" title="Close" />
        )}
      </div>
      {children}
    </dialog>
  );
};

export default Modal;
