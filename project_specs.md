# Project Overview: App Store Screenshot Designer

You are an expert Senior Frontend Developer. Your task is to build a web-based design tool (similar to Canva) specifically for creating App Store and Play Store screenshots. 

## 🛠 Tech Stack
- **Framework:** React (Next.js or Vite)
- **Canvas Engine:** Fabric.js (v6+ preferred)
- **State Management:** Zustand
- **Styling:** Tailwind CSS + Radix UI / Shadcn UI

## 📐 Core Architecture Rules
1. **Separation of Concerns:** React handles the DOM/UI (toolbars, sidebars). Fabric.js handles the canvas. Do NOT tie Fabric object state directly to React component state to avoid infinite re-render loops.
2. **Single Source of Truth:** Use Zustand to hold the global state of the canvas (e.g., `canvasWidth`, `numberOfScreens`, `activeObjectId`, `objectsArray`). 
3. **Canvas as Singleton:** Initialize the Fabric Canvas once inside a `useEffect` and store the instance in a React `useRef` or inside the Zustand store so it can be accessed by UI toolbars.

# MAKE SURE TO FOLLOW CURRENT CODE ARCHITECTURE

## 🚀 Phased Implementation Plan

Execute this project strictly phase by phase. DO NOT move to the next phase until the current one is fully functional and I have confirmed it.

### Phase 1: Setup & State Architecture
1. Scaffold the React app with Tailwind CSS.
2. Create a Zustand store (`useDesignStore`) with the following initial state:
   - `config`: { screens: 5, gap: 40, background: '#1a1a1a' }
   - `objects`: [] (will hold text, devices, shapes)
   - `selectedObject`: null
3. Create the base layout: A top toolbar area, a left sidebar for assets/layers, and a main central area for the Canvas.

### Phase 2: The Continuous Canvas
1. Create a `CanvasWorkspace` component.
2. Initialize `fabric.Canvas` inside a `useEffect`.
3. Dynamically calculate the total canvas width based on the Zustand `config` (e.g., `(screen_width * 5) + (gap * 4)`).
4. Draw unselectable, visual "guides" (vertical dashed lines) on the canvas to represent the boundaries of each individual App Store screenshot.

### Phase 3: Text Editing & Toolbar Sync
1. Implement a function to add `fabric.IText` or `fabric.Textbox` to the canvas.
2. Listen to Fabric's `selection:created`, `selection:updated`, and `selection:cleared` events. Update the `selectedObject` in Zustand.
3. Build the Contextual Top Toolbar in React:
   - When a text object is selected, show font family, font size, color, and alignment controls.
   - Wire these React controls to update the active Fabric object using `canvas.getActiveObject().set({ ... })` and trigger `canvas.requestRenderAll()`.

### Phase 4: Device Mockups & Image Masking (The Core Feature)
1. Implement a function to add a "Device Frame" to the canvas (a transparent PNG of a phone).
2. Implement an "Upload Screenshot" button in the React UI when a device is selected.
3. When a user uploads an image, add it to the canvas and use Fabric's `clipPath` or `globalCompositeOperation` to mask the user's uploaded image so it perfectly fits *behind* or *inside* the transparent screen area of the phone frame. 
4. Group the uploaded image and the device frame together using `fabric.Group` so they move and scale as a single unit.

### Phase 5: Shared Backgrounds & Export Engine
1. Allow the user to set a global background color or background image that spans the entire continuous canvas.
2. Implement the "Download" function:
   - Temporarily hide the visual screen guides.
   - Loop through the `config.screens` count.
   - For each screen, use `canvas.toDataURL()` with `left`, `top`, `width`, and `height` parameters to slice the massive canvas into individual standard App Store dimensions.
   - Zip the output images or trigger a batch download.

## ⚠️ AI Execution Directives
- **Stop and Ask:** At the end of every phase, output a summary of what you built and ask for my permission to proceed to the next phase.
- **Console Logs:** Liberally use `console.log` during Fabric.js event bindings so we can debug canvas interactions easily.
- **Types:** Use strict TypeScript interfaces for the Zustand store and Fabric objects.