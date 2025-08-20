import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';
import { db, auth } from './firebase';
import { onAuthStateChanged, signInAnonymously } from 'firebase/auth';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy } from 'firebase/firestore';
import Select from 'react-select';
import { Flame, Play, Check, Trash2, Bell, Clock, Calendar, Plus, Settings } from 'lucide-react';

// A custom hook to detect clicks outside a specified element
function useOnClickOutside(ref, handler) {
  useEffect(() => {
    const listener = (event) => {
      // Do nothing if clicking ref's element or descendent elements
      if (!ref.current || ref.current.contains(event.target)) {
        return;
      }
      handler(event);
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [ref, handler]);
}

const TaskTimer = ({ task, onTimerEnd }) => {
  const [remainingTime, setRemainingTime] = useState(null);

  useEffect(() => {
    if (!task.startTime || !task.duration) return;

    // Firestore timestamps need to be converted to JS Dates
    const startTimeMs = task.startTime.toDate ? task.startTime.toDate().getTime() : new Date(task.startTime).getTime();
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
  const [userId, setUserId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

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

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, user => {
      if (user) {
        setUserId(user.uid);
      } else {
        signInAnonymously(auth).catch(error => {
          console.error("Anonymous sign-in failed:", error);
        });
      }
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) return;

    setIsLoading(true);

    const tasksQuery = query(
      collection(db, 'tasks'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc')
    );
    
    const tagsQuery = query(
      collection(db, 'tags'),
      where('userId', '==', userId),
      orderBy('name')
    );

    const unsubscribeTasks = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
      setIsLoading(false);
    });
    const unsubscribeTags = onSnapshot(tagsQuery, (snapshot) => {
      setTags(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id })));
    });

    return () => {
      unsubscribeTasks();
      unsubscribeTags();
    };
  }, [userId]);

  const addTask = async (e) => {
    e.preventDefault();
    if (!inputText.trim() || !userId) return;
    await addDoc(collection(db, 'tasks'), {
      text: inputText,
      status: 'todo',
      deadline: deadline || null,
      duration: Number(duration) || null,
      tags: selectedTags.map(tag => tag.value),
      timestamp: new Date(),
      userId: userId,
    });
    setInputText('');
    setDeadline('');
    setDuration('');
    setSelectedTags([]);
  };

  const addTag = async (e) => {
    e.preventDefault();
    if (!newTag.trim() || !userId) return;
    const tagName = newTag.trim().toLowerCase();
    if (tags.find(tag => tag.name === tagName)) {
        alert("Tag already exists!");
        return;
    }
    await addDoc(collection(db, 'tags'), {
      name: tagName,
      userId: userId,
    });
    setNewTag('');
  };

  const updateTaskStatus = async (task, newStatus) => {
    const taskDoc = doc(db, 'tasks', task.id);
    const updateData = { status: newStatus };
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
  
  const handleTimerEnd = useCallback((task) => {
    const id = `timer-end-${task.id}`;
    setNotifications(currentNotifications => {
        if (currentNotifications.some(n => n.id === id)) {
            return currentNotifications;
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
        filtered.sort((a, b) => (b.timestamp?.toDate() || 0) - (a.timestamp?.toDate() || 0));
        break;
    }
    return filtered;
  };

  if (isLoading && !userId) {
      return <div>Loading...</div>;
  }

  const columnsData = {
      urgent: applyFilters(tasks.filter(t => t.status === 'urgent'), activeFilters.urgent),
      todo: applyFilters(tasks.filter(t => t.status === 'todo'), activeFilters.todo),
      doing: applyFilters(tasks.filter(t => t.status === 'doing'), activeFilters.doing),
      done: applyFilters(tasks.filter(t => t.status === 'done'), activeFilters.done)
  };

  const tagOptions = tags.map(tag => ({ value: tag.name, label: tag.name }));
  
  const FilterComponent = ({ columnKey, setFilter }) => {
      const [isOpen, setIsOpen] = useState(false);
      const dropdownRef = useRef(null);

      useOnClickOutside(dropdownRef, () => setIsOpen(false));

      const handleSelect = (option) => {
          setFilter(prev => ({ ...prev, [columnKey]: { ...prev[columnKey], sort: option }}));
          setIsOpen(false);
      }
      
      return (
          <div className="filter" ref={dropdownRef}>
              <button onClick={() => setIsOpen(!isOpen)} className="icon-button"><Settings size={18}/></button>
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
    urgent: { title: "Urgent", icon: <Flame size={20} className="column-icon" /> },
    todo: { title: "To Do", icon: <Calendar size={20} className="column-icon" /> },
    doing: { title: "Doing", icon: <Clock size={20} className="column-icon" /> },
    done: { title: "Done", icon: <Check size={20} className="column-icon" /> },
  }

  return (
    <div className="app-container">
      <header className="header">
        <h1>Task Board</h1>
        <NotificationBell notifications={notifications} setNotifications={setNotifications} />
      </header>

      <section className="controls-container">
        <div className="add-task-form form-section">
          <h3><Plus size={20} /> Add a New Task</h3>
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
              <Select options={tagOptions} isMulti value={selectedTags} onChange={setSelectedTags} className="tag-select" 
                styles={{ 
                  control: (base) => ({...base, backgroundColor: '#f7faff', borderColor: 'var(--border-color)', minHeight: '48px'}),
                  menu: (base) => ({...base, backgroundColor: 'var(--container-bg)', zIndex: 5})
                }}
              />
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
            <button type="submit" className="add-tag-button"><Plus size={16}/></button>
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