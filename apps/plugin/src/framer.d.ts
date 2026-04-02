declare module "framer" {
  import type { ComponentType } from "react"

  export enum ControlType {
    String = "string",
    Number = "number",
    Boolean = "boolean",
    Enum = "enum",
    Color = "color",
    Image = "image",
    File = "file",
    Slot = "slot" ,
    Link = "link",
    Array = "array",
    Object = "object",
    ComponentInstance = "componentinstance",
    Transition = "transition",
  }

  interface PropertyControlBase {
    title?: string
    hidden?(props: Record<string, unknown>): boolean
  }

  interface StringControl extends PropertyControlBase {
    type: ControlType.String
    defaultValue?: string
    placeholder?: string
  }

  interface NumberControl extends PropertyControlBase {
    type: ControlType.Number
    defaultValue?: number
    min?: number
    max?: number
    step?: number
    unit?: string
    displayStepper?: boolean
  }

  interface BooleanControl extends PropertyControlBase {
    type: ControlType.Boolean
    defaultValue?: boolean
    enabledTitle?: string
    disabledTitle?: string
  }

  interface EnumControl extends PropertyControlBase {
    type: ControlType.Enum
    defaultValue?: string
    options: string[]
    optionTitles?: string[]
  }

  interface SlotControl extends PropertyControlBase {
    type: ControlType.Slot
  }

  interface ColorControl extends PropertyControlBase {
    type: ControlType.Color
    defaultValue?: string
  }

  type PropertyControl =
    | StringControl
    | NumberControl
    | BooleanControl
    | EnumControl
    | SlotControl
    | ColorControl

  export function addPropertyControls<P>(
    component: ComponentType<P>,
    controls: Record<string, PropertyControl>,
  ): void

  export const RenderTarget: {
    current(): "CANVAS" | "PREVIEW" | "EXPORT"
    canvas: "CANVAS"
    preview: "PREVIEW"
    export: "EXPORT"
  }
}
