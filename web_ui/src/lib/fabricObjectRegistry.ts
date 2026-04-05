import type { Canvas, FabricObject } from 'fabric'

const ids = new WeakMap<FabricObject, string>()

export function registerFabricObjectId(obj: FabricObject, id: string): void {
  ids.set(obj, id)
}

export function getFabricObjectId(obj: FabricObject): string | undefined {
  return ids.get(obj)
}

export function findObjectOnCanvasByAppId(
  canvas: Canvas,
  id: string,
): FabricObject | undefined {
  return canvas.getObjects().find((o) => getFabricObjectId(o) === id)
}
