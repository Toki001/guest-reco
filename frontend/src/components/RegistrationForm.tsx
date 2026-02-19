import React, { useState } from 'react';

export const RegistrationForm = () => {
  const [formData, setFormData] = useState({ name: '', id: '' });
  const [file, setFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    const body = new FormData();
    body.append('id', formData.id);
    body.append('name', formData.name);
    body.append('image', file);

    const response = await fetch('http://localhost:5001/register_employee', {
      method: 'POST',
      body
    });
    
    if (response.ok) alert("Employee Registered and Indexed!");
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-slate-800 rounded-xl space-y-4 text-white">
      <h2 className="text-xl font-bold">Register New Personnel</h2>
      <input 
        className="w-full p-2 bg-slate-700 rounded" 
        placeholder="Employee ID" 
        onChange={e => setFormData({...formData, id: e.target.value})} 
      />
      <input 
        className="w-full p-2 bg-slate-700 rounded" 
        placeholder="Full Name" 
        onChange={e => setFormData({...formData, name: e.target.value})} 
      />
      <input type="file" onChange={e => setFile(e.target.files?.[0] || null)} />
      <button type="submit" className="w-full bg-blue-600 p-2 rounded font-bold">Save & Index</button>
    </form>
  );
};