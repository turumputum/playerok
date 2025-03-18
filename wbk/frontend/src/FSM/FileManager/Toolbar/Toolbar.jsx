import { useState } from "react";
import { BsCopy, BsFolderPlus, BsGridFill, BsScissors } from "react-icons/bs";
import { FiRefreshCw } from "react-icons/fi";
import {
  MdClear,
  MdOutlineDelete,
  MdOutlineFileDownload,
  MdOutlineFileUpload,
} from "react-icons/md";
import { BiRename } from "react-icons/bi";
import { FaListUl, FaRegPaste, FaRegSun } from "react-icons/fa6";
import LayoutToggler from "./LayoutToggler";
import { useFileNavigation } from "../../contexts/FileNavigationContext";
import { useSelection } from "../../contexts/SelectionContext";
import { useClipBoard } from "../../contexts/ClipboardContext";
import { useLayout } from "../../contexts/LayoutContext";
import { validateApiCallback } from "../../utils/validateApiCallback";
import "./Toolbar.scss";

import { useTranslation } from 'react-i18next';

const Toolbar = ({
  allowCreateFolder = true,
  allowUploadFile = true,
  onLayoutChange,
  onRefresh,
  triggerAction,
}) => {
  const [showToggleViewMenu, setShowToggleViewMenu] = useState(false);
  const { currentFolder } = useFileNavigation();
  const { selectedFiles, setSelectedFiles, handleDownload } = useSelection();
  const { clipBoard, setClipBoard, handleCutCopy, handlePasting } = useClipBoard();
  const { activeLayout } = useLayout();

  const { t, i18n } = useTranslation();

  // Toolbar Items
  const toolbarLeftItems = [
    {
      icon: <BsFolderPlus size={17} strokeWidth={0.3} />,
      text: t("fs.newFolder"),
      permission: allowCreateFolder,
      onClick: () => triggerAction.show("createFolder"),
    },
    {
      icon: <MdOutlineFileUpload size={18} />,
      text: t("fs.upload"),
      permission: allowUploadFile,
      onClick: () => triggerAction.show("uploadFile"),
    },
    {
      icon: <FaRegPaste size={18} />,
      text: t("fs.paste"),
      permission: !!clipBoard,
      onClick: handleFilePasting,
    },
  ];

  const toolbarRightItems = [
    {
      icon: activeLayout === "grid" ? <BsGridFill size={16} /> : <FaListUl size={16} />,
      title: "Change View",
      onClick: () => setShowToggleViewMenu((prev) => !prev),
    },
    {
      icon: <FiRefreshCw size={16} />,
      title: "Refresh",
      onClick: () => {
        validateApiCallback(onRefresh, "onRefresh");
        setClipBoard(null);
      },
    },
    {
      icon: <FaRegSun size={16} />,
      title: "Change lang",
      onClick: () => { i18n.changeLanguage(i18n.language == "ur" ? "en" : "ur") },
    }
  ];

  function handleFilePasting() {
    handlePasting(currentFolder);
  }

  const handleDownloadItems = () => {
    handleDownload();
    setSelectedFiles([]);
  };

  // Selected File/Folder Actions
  if (selectedFiles.length > 0) {
    return (
      <div className="toolbar file-selected">
        <div className="file-action-container">
          <div>
            <button className="item-action file-action" onClick={() => handleCutCopy(true)}>
              <BsScissors size={18} />
              <span>{ t("fs.cut") }</span>
            </button>
            <button className="item-action file-action" onClick={() => handleCutCopy(false)}>
              <BsCopy strokeWidth={0.1} size={17} />
              <span>{ t("fs.copy") }</span>
            </button>
            {clipBoard?.files?.length > 0 && (
              <button
                className="item-action file-action"
                onClick={handleFilePasting}
                // disabled={!clipBoard}
              >
                <FaRegPaste size={18} />
                <span>{ t("fs.paste") }</span>
              </button>
            )}
            {selectedFiles.length === 1 && (
              <button
                className="item-action file-action"
                onClick={() => triggerAction.show("rename")}
              >
                <BiRename size={19} />
                <span>{ t("fs.rename") }</span>
              </button>
            )}
            {!selectedFiles.isDirectory && (
              <button className="item-action file-action" onClick={handleDownloadItems}>
                <MdOutlineFileDownload size={19} />
                <span>{ t("fs.download") }</span>
              </button>
            )}
            <button
              className="item-action file-action"
              onClick={() => triggerAction.show("delete")}
            >
              <MdOutlineDelete size={19} />
              <span>{ t("fs.delete") }</span>
            </button>
          </div>
          <button
            className="item-action file-action"
            title="Clear selection"
            onClick={() => setSelectedFiles([])}
          >
            <span>
              { t("fs.itemsSelected", { count: selectedFiles.length }) }
            </span>
            <MdClear size={18} />
          </button>
        </div>
      </div>
    );
  }
  //

  return (
    <div className="toolbar">
      <div className="fm-toolbar">
        <div>
          {toolbarLeftItems
            .filter((item) => item.permission)
            .map((item, index) => (
              <button className="item-action" key={index} onClick={item.onClick}>
                {item.icon}
                <span>{item.text}</span>
              </button>
            ))}
        </div>
        <div>
          {toolbarRightItems.map((item, index) => (
            <div key={index} className="toolbar-left-items">
              <button className="item-action icon-only" title={item.title} onClick={item.onClick}>
                {item.icon}
              </button>
              {index !== toolbarRightItems.length - 1 && <div className="item-separator"></div>}
            </div>
          ))}

          {showToggleViewMenu && (
            <LayoutToggler
              setShowToggleViewMenu={setShowToggleViewMenu}
              onLayoutChange={onLayoutChange}
            />
          )}
        </div>
      </div>
    </div>
  );
};

Toolbar.displayName = "Toolbar";

export default Toolbar;
