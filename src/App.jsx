import React, { useState, useEffect, useCallback } from 'react';
import './App.css';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import Select from 'react-select';
import { Flame, Play, Check, Trash2, Bell, Clock, Calendar, Plus, Settings } from 'lucide-react';

// A new component to manage the countdown timer and progress bar for a task
const TaskTimer = ({ task, onTimerEnd }) => {
  const [remainingTime, setRemainingTime] = useState(null);

  useEffect(() => {
    if (!task.startTime || !task.duration) return;

    const startTimeMs = task.startTime.toDate().getTime();
    const durationMs = task.duration * 60 * 1000;
    const endTimeMs = startTimeMs + durationMs;

    const updateRemainingTime = () => {
      const nowMs = new Date().getTime();
      const newRemaining = endTimeMs - nowMs;

      if (newRemaining <= 0) {
        setRemainingTime(0);
        onTimerEnd(task);
        clearInterval(interval);
      } else {
        setRemainingTime(newRemaining);
      }
    };

    const interval = setInterval(updateRemainingTime, 1000);
    updateRemainingTime(); // Initial call

    return () => clearInterval(interval);
  }, [task, onTimerEnd]);

  if (remainingTime === null) return null;

  const totalDuration = task.duration * 60 * 1000;
  const progress = 100 - (remainingTime / totalDuration) * 100;
  const minutes = Math.floor(remainingTime / 60000);
  const seconds = Math.floor((remainingTime % 60000) / 1000);

  return (
    <div className="timer-container">
      <div className="time-display">
        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')} remaining
      </div>
      <div className="progress-bar-container">
        <div className="progress-bar" style={{ width: `${progress}%` }}></div>
      </div>
    </div>
  );
};

// A new component for the notification bell and its dropdown
const NotificationBell = ({ notifications, setNotifications }) => {
    const [isOpen, setIsOpen] = useState(false);
    const unreadCount = notifications.filter(n => !n.read).length;

    const markAsRead = (id) => {
        setNotifications(current => current.map(n => n.id === id ? { ...n, read: true } : n));
    };

    return (
        <div className="notification-bell">
            <div className="notification-icon" onClick={() => setIsOpen(!isOpen)}>
                <Bell size={24} />
                {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
            </div>
            {isOpen && (
                <div className="notification-dropdown">
                    {notifications.length === 0 ? (
                        <div className="notification-item">No new notifications</div>
                    ) : (
                       [...notifications].reverse().map(n => (
                            <div key={n.id} className={`notification-item ${n.read ? 'read' : ''}`} onClick={() => markAsRead(n.id)}>
                                {n.message}
                                <div className="notification-time">{new Date(n.timestamp).toLocaleTimeString()}</div>
                            </div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
};


function App() {
  const [tasks, setTasks] = useState([]);
  const [tags, setTags] = useState([]);
  const [inputText, setInputText] = useState('');
  const [deadline, setDeadline] = useState('');
  const [duration, setDuration] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  const [newTag, setNewTag] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [activeFilters, setActiveFilters] = useState({
    urgent: { sort: 'newest' },
    todo: { sort: 'newest' },
    doing: { sort: 'newest' },
    done: { sort: 'newest' },
  });

  // Effect to check for overdue tasks
  useEffect(() => {
    const newOverdueNotifications = [];
    tasks.forEach(task => {
        if (task.deadline && new Date(task.deadline) < new Date() && task.status !== 'done') {
            const id = `overdue-${task.id}`;
            // Add notification only if it doesn't already exist
            if (!notifications.some(n => n.id === id)) {
                newOverdueNotifications.push({
                    id,
                    message: `Task "${task.text}" is past its deadline.`,
                    read: false,
                    timestamp: new Date()
                });
            }
        }
    });
    if (newOverdueNotifications.length > 0) {
        setNotifications(prev => [...prev, ...newOverdueNotifications]);
    }
  }, [tasks]); // Reruns when tasks are updated


  useEffect(() => {
    const tasksQuery = query(collection(db, 'tasks'), orderBy('timestamp', 'desc'));
    const tagsQuery = query(collection(db, 'tags'), orderBy('name'));

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });
    const unsubscribeTags = onSnapshot(tagsQuery, (snapshot) => {
      setTags(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });

    return () => {
      unsubscribeTasks();
      unsubscribeTags();
    };
  }, []);

  const addTask = async (e) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    await addDoc(collection(db, 'tasks'), {
      text: inputText,
      status: 'todo',
      deadline: deadline || null,
      duration: Number(duration) || null,
      tags: selectedTags.map(tag => tag.value),
      timestamp: new Date(),
    });
    setInputText('');
    setDeadline('');
    setDuration('');
    setSelectedTags([]);
  };

  const addTag = async (e) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    // Check if tag already exists to avoid duplicates
    const existingTag = tags.find(tag => tag.name === newTag.trim().toLowerCase());
    if(existingTag) {
        alert("Tag already exists!");
        return;
    }
    await addDoc(collection(db, 'tags'), { name: newTag.trim().toLowerCase() });
    setNewTag('');
  };

  // Updated function to handle all status changes, including timers
  const updateTaskStatus = async (task, newStatus) => {
    const taskDoc = doc(db, 'tasks', task.id);
    const updateData = { status: newStatus };

    // When moving a task to 'doing', record its start time for the timer
    if (newStatus === 'doing' && task.duration) {
      updateData.startTime = new Date();
    }
    await updateDoc(taskDoc, updateData);
  };
  
  const deleteTask = async (id) => {
    if (window.confirm("Are you sure you want to delete this task?")) {
      await deleteDoc(doc(db, 'tasks', id));
    }
  };

  // Handler for when a task timer completes
  const handleTimerEnd = useCallback((task) => {
    const id = `timer-end-${task.id}`;
    // Use a functional update to prevent race conditions and ensure we have the latest state
    setNotifications(currentNotifications => {
        if (currentNotifications.some(n => n.id === id)) {
            return currentNotifications; // Already exists, do nothing
        }
        return [
            ...currentNotifications,
            {
                id,
                message: `Time's up for: "${task.text}"!`,
                read: false,
                timestamp: new Date(),
            },
        ];
    });
  }, []);

  const applyFilters = (tasksToFilter, filterConfig) => {
    let filtered = [...tasksToFilter];
    switch (filterConfig.sort) {
      case 'a-z':
        filtered.sort((a, b) => a.text.localeCompare(b.text));
        break;
      case 'date':
        filtered.sort((a, b) => (a.deadline && b.deadline) ? new Date(a.deadline) - new Date(b.deadline) : a.deadline ? -1 : 1);
        break;
      case 'newest':
      default:
        // Ensure timestamp is a Date object before comparing
        filtered.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        break;
    }
    return filtered;
  };

  const columnsData = {
      urgent: applyFilters(tasks.filter(t => t.status === 'urgent'), activeFilters.urgent),
      todo: applyFilters(tasks.filter(t => t.status === 'todo'), activeFilters.todo),
      doing: applyFilters(tasks.filter(t => t.status === 'doing'), activeFilters.doing),
      done: applyFilters(tasks.filter(t => t.status === 'done'), activeFilters.done)
  };

  const tagOptions = tags.map(tag => ({ value: tag.name, label: tag.name }));
  
  const FilterComponent = ({ columnKey, setFilter }) => {
      const [isOpen, setIsOpen] = useState(false);
      const handleSelect = (option) => {
          setFilter(prev => ({ ...prev, [columnKey]: { ...prev[columnKey], sort: option }}));
          setIsOpen(false);
      }
      return (
          <div className="filter">
              <button onClick={() => setIsOpen(!isOpen)} className="icon-button"><Settings size={20}/></button>
              {isOpen && (
                  <div className="filter-dropdown">
                      <div className="filter-option" onClick={() => handleSelect('newest')}>Sort by Newest</div>
                      <div className="filter-option" onClick={() => handleSelect('a-z')}>Sort A-Z</div>
                      <div className="filter-option" onClick={() => handleSelect('date')}>Sort by Deadline</div>
                  </div>
              )}
          </div>
      )
  }

  const columnDetails = {
    urgent: { title: "Urgent", icon: <Flame size={24} className="column-icon" /> },
    todo: { title: "To Do", icon: <Calendar size={24} className="column-icon" /> },
    doing: { title: "Doing", icon: <Clock size={24} className="column-icon" /> },
    done: { title: "Done", icon: <Check size={24} className="column-icon" /> },
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>Task Board</h1>
        <NotificationBell notifications={notifications} setNotifications={setNotifications} />
      </header>

      <section className="controls-container">
        <div className="add-task-form form-section">
          <h3>Add a New Task</h3>
          <form onSubmit={addTask}>
            <div className="input-group">
                <label>Task Name</label>
                <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="e.g., Design the new homepage" className="form-input" required />
            </div>
            <div className="optional-inputs">
                <div className="input-group">
                    <label>Deadline</label>
                    <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="form-input" />
                </div>
                <div className="input-group">
                    <label>Duration (mins)</label>
                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g., 60" className="form-input" />
                </div>
            </div>
            <div className="input-group">
              <label>Tags</label>
              <Select options={tagOptions} isMulti value={selectedTags} onChange={setSelectedTags} className="tag-select" />
            </div>
            <button type="submit" className="add-task-button"><Plus size={16}/> Add Task</button>
          </form>
        </div>

        <div className="tag-manager form-section">
          <h3>Manage Tags</h3>
          <div className="tag-list">
            {tags.length > 0 ? tags.map(tag => <span key={tag.id} className="tag-item">{tag.name}</span>) : <p className="no-tags-message">No tags created yet.</p>}
          </div>
          <form onSubmit={addTag} className="add-tag-group">
            <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="New tag name" className="form-input" />
            <button type="submit" className="add-tag-button">+</button>
          </form>
        </div>
      </section>

      <main className="board-container">
        {Object.entries(columnDetails).map(([key, {title, icon}]) => (
            <div key={key} className="column">
                <div className="column-header">
                    <div className="column-title">
                        {icon}
                        <h2>{title} ({columnsData[key].length})</h2>
                    </div>
                    <FilterComponent columnKey={key} setFilter={setActiveFilters} />
                </div>
                <div className="task-list">
                    {columnsData[key].map(task => (
                        <div key={task.id} className={`task-card status-${task.status}`}>
                            <p>{task.text}</p>
                            {task.status === 'doing' && task.duration > 0 && <TaskTimer task={task} onTimerEnd={handleTimerEnd} />}
                            <div className="task-details">
                                {task.deadline && <div className="detail-item"><Calendar size={14} /><span>{task.deadline}</span></div>}
                                {task.duration && <div className="detail-item"><Clock size={14} /><span>{task.duration} mins</span></div>}
                            </div>
                            {task.tags?.length > 0 && <div className="tag-list">{task.tags.map(t => <span key={t} className="tag-item">{t}</span>)}</div>}
                            <div className="task-actions">
                                {task.status === 'todo' && (
                                  <>
                                    <button onClick={() => updateTaskStatus(task, 'urgent')} className="icon-button" title="Make Urgent"><Flame size={18}/></button>
                                    <button onClick={() => updateTaskStatus(task, 'doing')} className="icon-button" title="Start Task"><Play size={18}/></button>
                                  </>
                                )}
                                {task.status === 'urgent' && <button onClick={() => updateTaskStatus(task, 'doing')} className="icon-button" title="Start Task"><Play size={18}/></button>}
                                {task.status === 'doing' && <button onClick={() => updateTaskStatus(task, 'done')} className="icon-button" title="Mark as Done"><Check size={18}/></button>}
                                {(task.status === 'done' || task.status === 'todo' || task.status === 'urgent') && <button onClick={() => deleteTask(task.id)} className="icon-button delete-button" title="Delete"><Trash2 size={18}/></button>}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        ))}
      </main>
    </div>
  );
}

export default App;