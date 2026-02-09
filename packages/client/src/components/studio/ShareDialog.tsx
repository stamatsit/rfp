import { useState, useEffect } from "react"
import { X, Users, Trash2, UserPlus } from "lucide-react"
import { studioApi } from "@/lib/api"

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:3001/api"

interface SharedUser {
  userId: string
  permission: "view" | "edit"
}

interface User {
  id: string
  name: string
  email: string
}

interface ShareDialogProps {
  documentId: string
  currentSharedWith: SharedUser[]
  onUpdate: (sharedWith: SharedUser[]) => void
  onClose: () => void
}

export function ShareDialog({ documentId, currentSharedWith, onUpdate, onClose }: ShareDialogProps) {
  const [sharedWith, setSharedWith] = useState<SharedUser[]>(currentSharedWith)
  const [users, setUsers] = useState<User[]>([])
  const [selectedUserId, setSelectedUserId] = useState("")
  const [selectedPermission, setSelectedPermission] = useState<"view" | "edit">("view")
  const [isSaving, setIsSaving] = useState(false)

  // Load users
  useEffect(() => {
    fetch(`${API_BASE}/auth/users`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => setUsers(data as User[]))
      .catch(() => {})
  }, [])

  const availableUsers = users.filter((u) => !sharedWith.some((s) => s.userId === u.id))

  const handleAdd = () => {
    if (!selectedUserId) return
    const updated = [...sharedWith, { userId: selectedUserId, permission: selectedPermission }]
    setSharedWith(updated)
    setSelectedUserId("")
  }

  const handleRemove = (userId: string) => {
    setSharedWith(sharedWith.filter((s) => s.userId !== userId))
  }

  const handlePermissionChange = (userId: string, permission: "view" | "edit") => {
    setSharedWith(sharedWith.map((s) => s.userId === userId ? { ...s, permission } : s))
  }

  const handleSave = async () => {
    setIsSaving(true)
    try {
      await studioApi.updateSharing(documentId, sharedWith)
      onUpdate(sharedWith)
      onClose()
    } catch {
      // ignore
    } finally {
      setIsSaving(false)
    }
  }

  const getUserName = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    return user?.name || user?.email || userId
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-[420px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Share Document</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add user */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="flex-1 h-9 px-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
            >
              <option value="">Select user...</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
            <select
              value={selectedPermission}
              onChange={(e) => setSelectedPermission(e.target.value as "view" | "edit")}
              className="h-9 px-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300"
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!selectedUserId}
              className="h-9 px-3 text-xs font-medium text-white rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-40 transition-colors"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Shared users list */}
        <div className="px-5 py-3 max-h-[200px] overflow-y-auto">
          {sharedWith.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">Not shared with anyone</p>
          ) : (
            <div className="space-y-2">
              {sharedWith.map((s) => (
                <div key={s.userId} className="flex items-center justify-between py-1.5">
                  <span className="text-xs text-slate-700 dark:text-slate-300">{getUserName(s.userId)}</span>
                  <div className="flex items-center gap-2">
                    <select
                      value={s.permission}
                      onChange={(e) => handlePermissionChange(s.userId, e.target.value as "view" | "edit")}
                      className="h-7 px-1.5 text-[10px] bg-transparent border border-slate-200 dark:border-slate-700 rounded text-slate-600 dark:text-slate-300"
                    >
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                    <button
                      onClick={() => handleRemove(s.userId)}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 transition-colors"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 text-sm font-medium text-white rounded-lg bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 shadow-md disabled:opacity-50 transition-all"
          >
            {isSaving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  )
}
