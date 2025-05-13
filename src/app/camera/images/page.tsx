"use client";

import { useState, useEffect } from "react";
import useWebSocket from "react-use-websocket";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface FileItem {
  name: string;
  path: string;
  type: "file" | "folder";
}

export default function FileExplorer() {
  const [path, setPath] = useState("");
  const [items, setItems] = useState<FileItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [wsStatus, setWsStatus] = useState<string>("Disconnected");

  const { lastMessage, readyState } = useWebSocket("/py/ws", {
    shouldReconnect: () => true,
    onOpen: () => setWsStatus("Connected"),
    onClose: () => setWsStatus("Disconnected"),
    onError: () => setWsStatus("Error"),
    onMessage: (message) => handleWebSocketMessage(message),
  });

  const handleWebSocketMessage = (message: MessageEvent) => {
    if (message.data instanceof Blob) {
      console.log("Received image data, ignoring...");
      return;
    }

    try {
      const status = JSON.parse(message.data);
      console.log("WebSocket message:", status);

      const newImagePath = status.new_image;
      console.log("Current path:", path);
      console.log("New image path:", newImagePath);

      if (newImagePath) {
        const imageFolder = newImagePath.split('/').slice(0, -1).join('/');
        console.log("Image folder:", imageFolder);

        if (imageFolder === path) {
          console.log(`New image detected in current folder (${path}), refreshing...`);
          fetchDirectory(path);
        } else {
          console.log(`New image in ${imageFolder}, but viewing ${path}, no refresh`);
        }
      } else if (status.current_folder && path === "") {
        console.log("New folder detected at root, refreshing...");
        fetchDirectory("");
      } else {
        console.log("No relevant update for current view");
      }
    } catch (e) {
      console.error("Failed to parse WebSocket message:", e);
    }
  };

  const fetchDirectory = async (targetPath: string = "") => {
    console.log(`Fetching directory: ${targetPath}`);
    try {
      const response = await fetch(`/py/explorer?path=${encodeURIComponent(targetPath)}`);
      console.log("Fetch response status:", response.status);
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to load directory");

      console.log("Raw fetch data:", data);
      console.log("Previous items:", items);

      const newItems = [...data.items].sort((a, b) => {
        if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
        const partsA = a.name.match(/(\d+|\D+)/g) || [a.name];
        const partsB = b.name.match(/(\d+|\D+)/g) || [b.name];
        const len = Math.min(partsA.length, partsB.length);
        for (let i = 0; i < len; i++) {
          const partA = partsA[i];
          const partB = partsB[i];
          const numA = parseInt(partA, 10);
          const numB = parseInt(partB, 10);
          if (!isNaN(numA) && !isNaN(numB)) {
            if (numA !== numB) return numA - numB;
          } else {
            const cmp = partA.localeCompare(partB);
            if (cmp !== 0) return cmp;
          }
        }
        return partsA.length - partsB.length || a.name.localeCompare(b.name);
      });
      setItems(newItems);
      setPath(targetPath);
      setError(null);

      console.log("Sorted items:", newItems.map(item => item.name));
      console.log("New path set to:", targetPath);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error occurred";
      console.error("Fetch error:", errorMsg);
      setError(errorMsg);
    }
  };

  const downloadFolder = (folderPath: string) => {
    const downloadLink = document.createElement("a");
    downloadLink.href = `/py/download_zip/${folderPath}`;
    downloadLink.download = `${folderPath.split('/').pop()}.zip`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  };

  const deleteFolder = async (folderPath: string) => {
    if (!confirm(`Are you sure you want to delete the folder '${folderPath}'?`)) return;

    try {
      const response = await fetch(`/py/delete_folder/${folderPath}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to delete folder");
      setItems((prevItems) => prevItems.filter((item) => item.path !== folderPath));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  };

  const navigate = (newPath: string) => {
    const nextPath = path ? `${path}/${newPath}` : newPath;
    fetchDirectory(nextPath);
  };

  const deleteFile = async (filePath: string) => {
    try {
      const response = await fetch(`/py/delete/${filePath}`, { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Failed to delete file");
      fetchDirectory(path);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    }
  };

  useEffect(() => {
    fetchDirectory();
  }, []);

  const goOnePageUp = () => {
    const currentPath = window.location.pathname;
    const newPath = currentPath.split("/").slice(0, -1).join("/");
    window.location.href = newPath;
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">File Explorer</h2>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Button variant="outline" onClick={goOnePageUp}>
          🔝 Return
        </Button>

        {path && path !== "/" && (
          <Button
            variant="outline"
            onClick={() => fetchDirectory(path.split("/").slice(0, -1).join("/"))}
          >
            🔙 Back
          </Button>
        )}

        {items.map((item) => (
          <div key={item.path} className="flex items-center justify-between p-2 border rounded-lg">
            {item.type === "folder" ? (
              <>
                <Button variant="ghost" onClick={() => navigate(item.name)}>
                  📂 {item.name}
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => downloadFolder(item.path)}
                  >
                    ⬇️ Download ZIP
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => deleteFolder(item.path)}
                  >
                    🗑️ Delete Folder
                  </Button>
                </div>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <a
                  href={`/py/images/${item.path}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-500 hover:underline"
                >
                  🖼️ {item.name}
                </a>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => deleteFile(item.path)}
                >
                  🗑️ Delete
                </Button>
              </div>
            )}
          </div>
        ))}

        {items.length === 0 && <p className="text-gray-500">📂 Empty folder</p>}
      </div>
    </div>
  );
}
