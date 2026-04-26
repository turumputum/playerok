
// Modal Manager Integration for Task Scheduler
document.addEventListener('DOMContentLoaded', function() {
    // Register the edit task modal
    if (document.getElementById('editTaskModal_2')) {
        modalManager.registerModal('editTaskModal_2', {
            onShow: function(event) {
                console.log(`[Scheduler] Opening edit task modal for index: ${edit_task_index}`);
                // This will be called from the open_edit_task function
            },
            onCleanup: function(event) {
                console.log(`[Scheduler] Cleaning up edit task modal`);
                // Optional cleanup after modal hides
            }
        });
    }

    // Also register delete modal if it exists
    if (document.getElementById('verify_delete')) {
        modalManager.registerModal('verify_delete', {
            onShow: function(event) {
                // Populate delete confirmation with task name
                var taskName = window.taskToDeleteName || 'Unknown';
                document.querySelector('.name_to_delete').textContent = taskName;
            }
        });
    }
});