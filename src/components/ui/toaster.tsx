import { useToast } from "@/hooks/use-toast"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { CheckCircle2, AlertTriangle } from "lucide-react"

export function Toaster() {
  const { toasts } = useToast()

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, variant, ...props }) {
        const isDestructive = variant === 'destructive';
        
        return (
          <Toast key={id} variant={variant} {...props}>
            <div className="flex gap-3 items-start">
              {isDestructive ? (
                <AlertTriangle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
              ) : (
                <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5 animate-bounce" />
              )}
              <div className="grid gap-1">
                {title && <ToastTitle className="text-slate-100 font-bold">{title}</ToastTitle>}
                {description && (
                  <ToastDescription className="text-slate-400 text-xs font-medium">{description}</ToastDescription>
                )}
              </div>
            </div>
            {action}
            <ToastClose className="text-slate-400 hover:text-slate-100 border-none bg-transparent hover:bg-slate-800/50 rounded-lg p-1.5 transition-colors absolute right-2.5 top-2.5" />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
