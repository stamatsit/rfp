import { useState, useEffect } from "react"
import { X, Users, Trash2, UserPlus, Loader2, Check, UserCheck } from "lucide-react"
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
  const [isSaved, setIsSaved] = useState(false)
  const [isLoadingUsers, setIsLoadingUsers] = useState(true)

  // Load users
  useEffect(() => {
    setIsLoadingUsers(true)
    fetch(`${API_BASE}/auth/users`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => { setUsers(data as User[]); setIsLoadingUsers(false) })
      .catch(() => { setIsLoadingUsers(false) })
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
      setIsSaved(true)
      setTimeout(() => onClose(), 600)
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

  const getUserEmail = (userId: string) => {
    const user = users.find((u) => u.id === userId)
    return user?.email || ""
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-[420px] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <h3 className="text-sm font-semibold text-slate-800 dark:text-white">Share Document</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Add user */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
          <p className="text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-2">Add people</p>
          <div className="flex gap-2">
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              disabled={isLoadingUsers}
              className="flex-1 h-9 px-3 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400 disabled:opacity-50"
            >
              <option value="">
                {isLoadingUsers ? "Loading users…" : availableUsers.length === 0 ? "No users available" : "Select user…"}
              </option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>{u.name || u.email}</option>
              ))}
            </select>
            <select
              value={selectedPermission}
              onChange={(e) => setSelectedPermission(e.target.value as "view" | "edit")}
              className="h-9 px-2 text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-400/40 focus:border-emerald-400"
              title="Permission level"
            >
              <option value="view">Can view</option>
              <option value="edit">Can edit</option>
            </select>
            <button
              onClick={handleAdd}
              disabled={!selectedUserId}
              className="h-9 w-9 flex items-center justify-center rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 text-white disabled:opacity-30 transition-colors"
              title="Add user"
            >
              <UserPlus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Shared users list */}
        <div className="px-5 py-3 min-h-[80px] max-h-[200px] overflow-y-auto">
          {sharedWith.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-5 gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-slate-400 dark:text-slate-500" />
              </div>
              <p className="text-xs text-slate-400 dark:text-slate-500 text-center leading-relaxed">
                Only you have access.<br />
                <span className="text-emerald-600 dark:text-emerald-400">Add people above</span> to collaborate.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sharedWith.map((s) => (
                <div key={s.userId} className="flex items-center gap-3 py-1.5 px-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors group">
                  <div className="w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                      {(getUserName(s.userId) || "?").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate">{getUserName(s.userId)}</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{getUserEmail(s.userId)}</p>
                  </div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <select
                      value={s.permission}
                      onChange={(e) => handlePermissionChange(s.userId, e.target.value as "view" | "edit")}
                      className="h-7 px-1.5 text-[10px] bg-transparent border border-slate-200 dark:border-slate-700 rounded-md text-slate-600 dark:text-slate-300 focus:outline-none focus:ring-1 focus:ring-emerald-400/30"
                    >
                      <option value="view">Can view</option>
                      <option value="edit">Can edit</option>
                    </select>
                    <button
                      onClick={() => handleRemove(s.userId)}
                      className="p-1 text-slate-300 dark:text-slate-600 hover:text-red-500 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all rounded"
                      title="Remove"
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
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || isSaved}
            className="flex items-center gap-1.5 px-4 py-1.5 text-sm font-medium text-white rounded-lg bg-emerald-500 hover:bg-emerald-600 active:bg-emerald-700 disabled:opacity-50 transition-all"
          >
            {isSaved ? (
              <><Check className="w-3.5 h-3.5" /> Saved</>
            ) : isSaving ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…</>
            ) : (
              "Save"
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
