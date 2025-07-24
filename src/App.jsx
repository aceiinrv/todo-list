import React, { useState, useEffect } from 'react';
import './App.css';
import { db } from './firebase';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, query, orderBy } from 'firebase/firestore';
import Select from 'react-select'; // We'll need to install this!

// First, install react-select for multi-tag selection
// Open your terminal and run: npm install react-select

function App() {
  // Main state for all tasks and tags from Firebase
  const [tasks, setTasks] = useState([]);
  const [tags, setTags] = useState([]);

  // State for the new task form
  const [inputText, setInputText] = useState('');
  const [deadline, setDeadline] = useState('');
  const [duration, setDuration] = useState('');
  const [selectedTags, setSelectedTags] = useState([]);
  
  // State for the tag manager
  const [newTag, setNewTag] = useState('');

  // State for filters
  const [activeFilters, setActiveFilters] = useState({
    todo: { sort: 'newest' },
    doing: { sort: 'newest' },
    done: { sort: 'newest' },
  });

  // Fetch Tasks and Tags from Firebase
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

  // Handler for adding a new task
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

  // Handler for adding a new tag
  const addTag = async (e) => {
    e.preventDefault();
    if (!newTag.trim()) return;
    await addDoc(collection(db, 'tags'), { name: newTag.trim().toLowerCase() });
    setNewTag('');
  };

  // Handler for updating a task's status (e.g., todo -> doing)
  const updateTaskStatus = async (task, newStatus) => {
    const taskDoc = doc(db, 'tasks', task.id);
    await updateDoc(taskDoc, { status: newStatus });
  };
  
  const deleteTask = async (id) => {
      await deleteDoc(doc(db, 'tasks', id));
  };


  // Filtering logic
  const applyFilters = (tasksToFilter, filterConfig) => {
    let filtered = [...tasksToFilter];
    
    // Sorting
    switch (filterConfig.sort) {
      case 'a-z':
        filtered.sort((a, b) => a.text.localeCompare(b.text));
        break;
      case 'date':
        filtered.sort((a, b) => (a.deadline && b.deadline) ? new Date(a.deadline) - new Date(b.deadline) : a.deadline ? -1 : 1);
        break;
      case 'newest':
      default:
        filtered.sort((a, b) => b.timestamp.toDate() - a.timestamp.toDate());
        break;
    }

    return filtered;
  };
  
  // Memoize columns to prevent re-renders
  const todoTasks = applyFilters(tasks.filter(t => t.status === 'todo'), activeFilters.todo);
  const doingTasks = applyFilters(tasks.filter(t => t.status === 'doing'), activeFilters.doing);
  const doneTasks = applyFilters(tasks.filter(t => t.status === 'done'), activeFilters.done);

  // Options for react-select
  const tagOptions = tags.map(tag => ({ value: tag.name, label: tag.name }));
  
  const FilterComponent = ({ columnKey, setFilter }) => {
      const [isOpen, setIsOpen] = useState(false);
      
      const handleSelect = (option) => {
          setFilter(prev => ({ ...prev, [columnKey]: { ...prev[columnKey], sort: option }}));
          setIsOpen(false);
      }
      
      return (
          <div className="filter">
              <button onClick={() => setIsOpen(!isOpen)} className="filter-button">⚙️</button>
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

  return (
    <div className="app-container">
      <h1>Task Board</h1>

      {/* --- CONTROLS SECTION --- */}
      <section className="controls-container">
        <div className="add-task-form form-section">
          <h3>Add a New Task</h3>
          <form onSubmit={addTask}>
            <div className="input-group">
                <label>Task Name</label>
                <input type="text" value={inputText} onChange={e => setInputText(e.target.value)} placeholder="e.g., Finish report" className="form-input" required />
            </div>
            <div className="optional-inputs">
                <div className="input-group">
                    <label>Deadline (Optional)</label>
                    <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)} className="form-input" />
                </div>
                <div className="input-group">
                    <label>Duration (mins, Optional)</label>
                    <input type="number" value={duration} onChange={e => setDuration(e.target.value)} placeholder="e.g., 60" className="form-input" />
                </div>
            </div>
            <div className="input-group">
              <label>Tags (Optional)</label>
              <Select options={tagOptions} isMulti value={selectedTags} onChange={setSelectedTags} className="tag-select" />
            </div>
            <button type="submit" className="add-task-button">Add Task</button>
          </form>
        </div>

        <div className="tag-manager form-section">
          <h3>Manage Tags</h3>
          <div className="tag-list">
            {tags.map(tag => <span key={tag.id} className="tag-item">{tag.name}</span>)}
          </div>
          <form onSubmit={addTag} className="add-tag-group">
            <input type="text" value={newTag} onChange={e => setNewTag(e.target.value)} placeholder="New tag name" className="form-input" />
            <button type="submit" className="add-task-button">+</button>
          </form>
        </div>
      </section>

      {/* --- BOARD SECTION --- */}
      <main className="board-container">
        {/* TO DO Column */}
        <div className="column">
            <div className="column-header">
              <h2>To Do ({todoTasks.length})</h2>
              <FilterComponent columnKey="todo" setFilter={setActiveFilters} />
            </div>
            {todoTasks.map(task => (
                <div key={task.id} className="task-card status-todo">
                    <p>{task.text}</p>
                    <div className="task-details">
                        {task.deadline && <div>📅 {task.deadline}</div>}
                        {task.duration && <div>⏱️ {task.duration} mins</div>}
                        <div className="tag-list">{task.tags?.map(t => <span key={t} className="tag-item">{t}</span>)}</div>
                    </div>
                    <div className="task-actions">
                        <button onClick={() => updateTaskStatus(task, 'doing')} className="play-button" title="Start Task">▶️</button>
                        <button className="edit-button" title="Edit">✏️</button>
                        <button onClick={() => deleteTask(task.id)} className="delete-button" title="Delete">🗑️</button>
                    </div>
                </div>
            ))}
        </div>
        
        {/* DOING Column */}
        <div className="column">
            <div className="column-header">
              <h2>Doing ({doingTasks.length})</h2>
              <FilterComponent columnKey="doing" setFilter={setActiveFilters} />
            </div>
            {doingTasks.map(task => (
                <div key={task.id} className="task-card status-doing">
                    <p>{task.text}</p>
                     <div className="task-details">
                        {task.deadline && <div>📅 {task.deadline}</div>}
                        {task.duration && <div>⏱️ {task.duration} mins</div>}
                        <div className="tag-list">{task.tags?.map(t => <span key={t} className="tag-item">{t}</span>)}</div>
                    </div>
                    <div className="task-actions">
                        <button onClick={() => updateTaskStatus(task, 'done')} className="complete-button" title="Mark as Done">✅</button>
                    </div>
                </div>
            ))}
        </div>

        {/* DONE Column */}
        <div className="column">
            <div className="column-header">
              <h2>Done ({doneTasks.length})</h2>
              <FilterComponent columnKey="done" setFilter={setActiveFilters} />
            </div>
            {doneTasks.map(task => (
                 <div key={task.id} className="task-card status-done">
                    <p style={{textDecoration: 'line-through'}}>{task.text}</p>
                     <div className="task-details">
                        <div className="tag-list">{task.tags?.map(t => <span key={t} className="tag-item">{t}</span>)}</div>
                    </div>
                     <div className="task-actions">
                        <button onClick={() => deleteTask(task.id)} className="delete-button" title="Delete">🗑️</button>
                    </div>
                </div>
            ))}
        </div>
      </main>
    </div>
  );
}

export default App;