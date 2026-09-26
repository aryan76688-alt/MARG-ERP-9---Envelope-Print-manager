import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAuthToken } from '../api/client';
import { Plus, Edit2, Trash2, Shield, User as UserIcon, Check } from 'lucide-react';

export const Users: React.FC = () => {
  const queryClient = useQueryClient();
  const [editingUser, setEditingUser] = useState<any>(null);
  const [showForm, setShowForm] = useState(false);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: async () => {
      const res = await fetch('/api/users', {
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error('Failed to load users');
      return res.json();
    }
  });

  const saveUserMutation = useMutation({
    mutationFn: async (user: any) => {
      const isEdit = !!user.id;
      const url = isEdit ? `/api/users/${user.id}` : '/api/users';
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${getAuthToken()}`
        },
        body: JSON.stringify(user)
      });
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to save user');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setShowForm(false);
      setEditingUser(null);
    }
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getAuthToken()}` }
      });
      if (!res.ok) throw new Error('Failed to delete user');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
    }
  });

  const handleSave = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const data = {
      id: editingUser?.id,
      username: formData.get('username'),
      full_name: formData.get('full_name'),
      role: formData.get('role'),
      is_active: formData.get('is_active') === 'on',
      permissions: JSON.stringify(formData.getAll('permissions')),
    };
    if (formData.get('password')) {
      (data as any).password = formData.get('password');
    }
    saveUserMutation.mutate(data);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-600" /> User Management
          </h2>
          <p className="text-sm text-slate-500">Manage access, roles, and permissions.</p>
        </div>
        {!showForm && (
          <button onClick={() => { setEditingUser(null); setShowForm(true); }} className="btn-primary flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> Add User
          </button>
        )}
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
          <h3 className="text-lg font-bold text-slate-800 mb-4">{editingUser ? 'Edit User' : 'Create User'}</h3>
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Username</label>
              <input name="username" defaultValue={editingUser?.username} required className="w-full border p-2 rounded-lg" disabled={!!editingUser} />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Password {editingUser && '(Leave empty to keep current)'}</label>
              <input name="password" type="password" required={!editingUser} className="w-full border p-2 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Full Name</label>
              <input name="full_name" defaultValue={editingUser?.full_name} required className="w-full border p-2 rounded-lg" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Role</label>
              <select name="role" defaultValue={editingUser?.role || 'employee'} className="w-full border p-2 rounded-lg">
                <option value="super_admin">Super Admin</option>
                <option value="admin">Admin</option>
                <option value="employee">Employee</option>
              </select>
            </div>
            
            <div className="md:col-span-2 mt-2">
              <label className="block text-sm font-medium text-slate-700 mb-2">Permissions</label>
              <div className="flex gap-4">
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="permissions" value="create_job" defaultChecked={editingUser ? editingUser.permissions?.includes('create_job') : true} />
                  <span>Create Print/PDF Jobs</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" name="permissions" value="save_job" defaultChecked={editingUser ? editingUser.permissions?.includes('save_job') : true} />
                  <span>Save Jobs (No Print)</span>
                </label>
              </div>
            </div>

            <div className="md:col-span-2 mt-2 flex items-center gap-2">
              <input type="checkbox" name="is_active" id="is_active" defaultChecked={editingUser ? editingUser.is_active : true} />
              <label htmlFor="is_active" className="text-sm font-medium text-slate-700">Account Active</label>
            </div>

            <div className="md:col-span-2 flex justify-end gap-3 mt-4 pt-4 border-t">
              <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 border rounded-lg text-slate-600 hover:bg-slate-50 font-medium">Cancel</button>
              <button type="submit" disabled={saveUserMutation.isPending} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium flex items-center gap-2">
                <Check className="w-4 h-4" /> {saveUserMutation.isPending ? 'Saving...' : 'Save User'}
              </button>
            </div>
            
            {saveUserMutation.isError && (
              <div className="md:col-span-2 text-red-600 text-sm">{saveUserMutation.error.message}</div>
            )}
          </form>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-sm font-semibold text-slate-600">
              <th className="p-4">User</th>
              <th className="p-4">Role</th>
              <th className="p-4">Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-sm">
            {isLoading ? (
              <tr><td colSpan={4} className="p-8 text-center text-slate-500">Loading...</td></tr>
            ) : (
              users.map((u: any) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="p-4">
                    <div className="font-medium text-slate-900">{u.full_name}</div>
                    <div className="text-xs text-slate-500">@{u.username}</div>
                  </td>
                  <td className="p-4">
                    <span className="px-2 py-1 bg-slate-100 rounded text-xs font-medium text-slate-700 uppercase">
                      {u.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="p-4">
                    {u.is_active ? (
                      <span className="text-emerald-600 text-xs font-semibold px-2 py-1 bg-emerald-50 rounded">Active</span>
                    ) : (
                      <span className="text-red-600 text-xs font-semibold px-2 py-1 bg-red-50 rounded">Inactive</span>
                    )}
                  </td>
                  <td className="p-4 text-right flex items-center justify-end gap-2">
                    <button onClick={() => { setEditingUser(u); setShowForm(true); }} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded" title="Edit">
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button onClick={() => deleteUserMutation.mutate(u.id)} className="p-1.5 text-red-600 hover:bg-red-50 rounded" title="Delete" disabled={deleteUserMutation.isPending}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
