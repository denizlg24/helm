"use client"

import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSeparator,
  InputOTPSlot,
} from "@workspace/ui/components/input-otp"
import {
  type Control,
  type FieldPath,
  type FieldValues,
  useController,
} from "react-hook-form"
import { cn } from "../lib/utils"

type TextFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>
  name: FieldPath<TValues>
  label: string
  description?: string
  type?: React.HTMLInputTypeAttribute
  placeholder?: string
  autoComplete?: string
  autoFocus?: boolean
  disabled?: boolean
}

function TextField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  type = "text",
  placeholder,
  autoComplete,
  autoFocus,
  disabled,
}: TextFieldProps<TValues>) {
  const { field, fieldState } = useController({ control, name })
  const invalid = Boolean(fieldState.error)
  const descriptionId = description ? `${name}-description` : undefined

  return (
    <Field data-invalid={invalid}>
      <FieldLabel htmlFor={name}>{label}</FieldLabel>
      <Input
        {...field}
        id={name}
        type={type}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        disabled={disabled || field.disabled}
        aria-invalid={invalid}
        aria-describedby={descriptionId}
      />
      {description ? (
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
      ) : null}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

type OtpFieldProps<TValues extends FieldValues> = {
  control: Control<TValues>
  name: FieldPath<TValues>
  label?: string
  description?: string
  length?: number
  groupSize?: number
  pattern?: string
  disabled?: boolean
  containerClassName?: string
}

function OtpField<TValues extends FieldValues>({
  control,
  name,
  label,
  description,
  length = 8,
  groupSize = 4,
  pattern,
  disabled,
  containerClassName,
}: OtpFieldProps<TValues>) {
  const { field, fieldState } = useController({ control, name })
  const invalid = Boolean(fieldState.error)
  const groupItems = Array.from(
    { length: Math.ceil(length / groupSize) },
    (_, groupIndex) => ({
      id: groupIndex,
      slots: Array.from(
        { length: groupSize },
        (__, slotIndex) => groupIndex * groupSize + slotIndex
      ).filter((index) => index < length),
    })
  )

  return (
    <Field data-invalid={invalid} className="w-full">
      {label && <FieldLabel htmlFor={name}>{label}</FieldLabel>}
      <InputOTP
        id={name}
        maxLength={length}
        pattern={pattern}
        value={field.value ?? ""}
        onChange={field.onChange}
        onBlur={field.onBlur}
        name={field.name}
        ref={field.ref}
        disabled={disabled || field.disabled}
        containerClassName={cn("justify-start", containerClassName)}
      >
        {groupItems.map((group) => (
          <span className="flex items-center" key={group.id}>
            <InputOTPGroup>
              {group.slots.map((slot) => (
                <InputOTPSlot index={slot} key={slot} />
              ))}
            </InputOTPGroup>
            {group.id < groupItems.length - 1 ? <InputOTPSeparator /> : null}
          </span>
        ))}
      </InputOTP>
      {description ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={[fieldState.error]} />
    </Field>
  )
}

export { OtpField, TextField }
