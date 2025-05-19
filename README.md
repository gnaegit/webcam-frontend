# Raspberry Pi Webcam Dashboard (Frontend)

The frontend for a Raspberry Pi-based webcam system, built with Next.js. It provides a responsive UI to manage cameras (Raspberry Pi via picamera2 or CameraIDS), preview live streams, store images at set intervals, and monitor system metrics like CPU usage, memory, and temperature. Integrates with the backend API at [webcam-backend](https://github.com/gnaegit/webcam-backend).

## Features

- **Camera Management**: Switch between Raspberry Pi (picamera2) and CameraIDS cameras.
- **Live Preview**: Stream camera feed via WebSocket with start/stop controls.
- **Image Storage**: Capture and store images at configurable intervals, with access to stored images.
- **System Monitoring**: Display Raspberry Pi system details (hostname, platform, architecture, CPU temperature, CPU usage per core, memory usage).
- **Responsive UI**: Built with Next.js 15.1.7, shadcn/ui (New York style), Tailwind CSS, and Lucide icons.

## Prerequisites

- **Hardware**: Raspberry Pi (tested on Raspberry Pi 5) with compatible cameras (picamera and/or CameraIDS).
- **Software**:
  - Node.js (v18 or later)
  - Next.js (15.1.7)
  - Systemd (for production)
- **Backend**: [webcam-backend](https://github.com/gnaegit/webcam-backend) running on `http://0.0.0.0:8000`.
  - For CameraIDS, ensure IDS Peak software is installed (see backend README).
- **Dependencies**: Listed in `package.json`.

## Installation

1. **Clone the Repository**:
   ```bash
   git clone https://github.com/gnaegit/webcam-frontend.git
   mv webcam-frontend /home/pi/webcam/webcam-frontend
   cd /home/pi/webcam/webcam-frontend
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```
   - Installs `next@15.1.7`, `react@19.0.0`, `react-use-websocket`, `@radix-ui/*` (shadcn/ui), `lucide-react`, `tailwindcss`, etc.

3. **Set Up shadcn/ui and Tailwind CSS**:
   - Configured in `components.json` with "New York" style, Tailwind CSS (`tailwind.config.ts`, `src/app/globals.css`), and Lucide icons.
   - Aliases: `@/components`, `@/lib/utils`, `@/ui`, `@/lib`, `@/hooks`.
   - Verify `src/app/globals.css` and `tailwind.config.ts` are present.

4. **Configure Proxy**:
   - `next.config.js` proxies `/py/:path*` to `http://0.0.0.0:8000/:path*`:
     ```javascript
     const nextConfig = {
       async rewrites() {
         return [
           {
             source: '/py/:path*',
             destination: 'http://0.0.0.0:8000/:path*',
           },
         ];
       },
     };
     export default nextConfig;
     ```
   - Ensure the backend runs on `http://0.0.0.0:8000` or update `next.config.js` if hosted elsewhere.

5. **Set Up Systemd Service (Production)**:
   - Copy `webcam-frontend.service` to `/etc/systemd/system/`:
     ```bash
     sudo cp webcam-frontend.service /etc/systemd/system/
     ```
   - Verify `ExecStart` uses the correct `npm` path:
     ```ini
     [Unit]
     Description=Webcam Next.js Server
     After=network.target

     [Service]
     User=pi
     WorkingDirectory=/home/pi/Projects/webcam
     ExecStart=/usr/bin/npm run start
     Restart=always
     Environment=PORT=3000
     StandardOutput=journal
     StandardError=journal

     [Install]
     WantedBy=multi-user.target
     ```
   - Enable the service (do not start if developing):
     ```bash
     sudo systemctl enable webcam-frontend.service
     ```

6. **Verify Setup**:
   - Start the service (production):
     ```bash
     sudo systemctl start webcam-frontend.service
     sudo systemctl status webcam-frontend.service
     ```
   - Ensure the backend is running on `http://0.0.0.0:8000`.

## Usage

1. **Access the App**:
   - Navigate to `http://<raspberry-pi-ip>:3000` (port `3000`).

2. **Welcome Page** (`/`):
   - Click "Go to Camera Page" to access camera controls.

3. **Camera Page** (`/camera`):
   - Select Raspberry Pi or CameraIDS cameras.
   - Start/stop live preview via WebSocket.
   - Start/stop image storage and set interval (seconds).
   - View stored images via "View Stored Images".

4. **Stats Page** (`/stats`):
   - View system info: hostname, platform, architecture, CPU temperature, CPU usage, memory usage.

5. **Monitoring**:
   - Check WebSocket and camera status on the camera page.
   - Review UI errors/warnings.

## Project Structure

- `app/page.tsx`: Welcome page with link to camera page.
- `app/camera/page.tsx`: Camera selection, preview, storage.
- `app/stats/page.tsx`: System info (CPU, memory, temperature).
- `next.config.js`: Proxies `/py/:path*` to backend.
- `components.json`: Configures shadcn/ui, Tailwind CSS, Lucide icons.
- `package.json`: Dependencies and scripts (e.g., `npm run dev --turbopack`).
- `webcam-frontend.service`: Systemd service for production.

## Development

1. **Stop Production Services**:
   - Stop frontend service:
     ```bash
     sudo systemctl stop webcam-frontend.service
     ```
   - Stop backend service:
     ```bash
     sudo systemctl stop webcam-backend.service
     ```
   - Check ports:
     ```bash
     sudo lsof -i :3000
     sudo lsof -i :8000
     ```

2. **Run the Backend**:
   - Follow [webcam-backend README](https://github.com/gnaegit/webcam-backend):
     ```bash
     cd ../camera-app-fish
     source venv/bin/activate
     uvicorn main:app --host 0.0.0.0 --port 8000
     ```

3. **Run the Frontend**:
   ```bash
   npm run dev
   ```
   - Uses Turbopack (`next dev --turbopack`).
   - Access at `http://localhost:3000`. Hot-reloads changes.

4. **Testing**:
   - Verify camera functionality, WebSocket streaming, system stats.
   - Check browser console and logs.

## Production

1. **Stop Development Servers**:
   - Stop `npm run dev` and backend processes.

2. **Build the App**:
   ```bash
   npm run build
   ```

3. **Start Services**:
   - Start frontend:
     ```bash
     sudo systemctl start webcam-frontend.service
     ```
   - Start backend:
     ```bash
     sudo systemctl start webcam-backend.service
     ```

4. **Verify**:
   - Check status:
     ```bash
     sudo systemctl status webcam-frontend.service
     sudo systemctl status webcam-backend.service
     ```
   - Access at `http://<raspberry-pi-ip>:3000`.

## Troubleshooting

- **Service Fails**:
  - Check logs: `journalctl -u webcam-frontend.service`.
  - Verify `npm` path: `which npm`.
  - Ensure `/home/pi/webcam/webcam-frontend` exists.
- **Port Conflict**:
  - Check ports: `sudo lsof -i :3000` or `sudo lsof -i :8000`.
- **Backend Unavailable**:
  - Verify backend runs on `http://0.0.0.0:8000`.
- **Camera Issues**:
  - Check hardware and backend logs (`journalctl -u webcam-backend.service`).
  - For CameraIDS, ensure IDS Peak is installed (see backend README).

## Contributing

Submit pull requests or issues to [webcam-frontend](https://github.com/gnaegit/webcam-frontend) or [webcam-backend](https://github.com/gnaegit/webcam-backend).

## License

MIT License.
