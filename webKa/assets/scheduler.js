
var exampleModal = document.getElementById('editTaskModal')
console.log(exampleModal)
exampleModal.addEventListener('show.bs.modal', function (event) {
    var button = event.relatedTarget
    var index = button.getAttribute('data-bs-whatever')

    var modalTitle = exampleModal.querySelector('.modal-title')
    var modalBodyInput = exampleModal.querySelector('.modal-body input')

    var editedTask_index = parseInt(index)
    console.log(editedTask_index)
    })