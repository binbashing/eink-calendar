import * as React from "react"

const Select = ({ children, onValueChange, defaultValue, value, ...props }) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const [selectedValue, setSelectedValue] = React.useState(value || defaultValue || "")
  
  const handleValueChange = (newValue) => {
    setSelectedValue(newValue)
    onValueChange?.(newValue)
    setIsOpen(false)
  }
  
  return (
    <div className="relative">
      {React.Children.map(children, (child) => 
        React.cloneElement(child, { 
          isOpen, 
          setIsOpen, 
          selectedValue, 
          onValueChange: handleValueChange 
        })
      )}
    </div>
  )
}

const SelectTrigger = React.forwardRef(({ className = "", children, isOpen, setIsOpen, selectedValue, ...props }, ref) => (
  <button
    ref={ref}
    className={`flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
    onClick={() => setIsOpen(!isOpen)}
    {...props}
  >
    {children}
    <span className="ml-2">▼</span>
  </button>
))
SelectTrigger.displayName = "SelectTrigger"

const SelectValue = ({ placeholder, selectedValue }) => (
  <span>{selectedValue || placeholder}</span>
)

const SelectContent = ({ className = "", children, isOpen, selectedValue, onValueChange }) => {
  if (!isOpen) return null
  
  return (
    <div className={`absolute z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md ${className}`}>
      {React.Children.map(children, (child) =>
        React.cloneElement(child, { selectedValue, onValueChange })
      )}
    </div>
  )
}

const SelectItem = ({ className = "", children, value, selectedValue, onValueChange, ...props }) => (
  <div
    className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground ${selectedValue === value ? 'bg-accent' : ''} ${className}`}
    onClick={() => onValueChange(value)}
    {...props}
  >
    {children}
  </div>
)

export { Select, SelectContent, SelectItem, SelectTrigger, SelectValue }
