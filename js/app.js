document.addEventListener("DOMContentLoaded", function () {

    const generateBtn = document.getElementById("generateBtn");
    const fullNameInput = document.getElementById("fullName");
    const skillsInput = document.getElementById("skills");
    const reasonInput = document.getElementById("reason");
    const output = document.getElementById("output");

    generateBtn.addEventListener("click", function () {

        const fullName = fullNameInput.value.trim();
        const skills = skillsInput.value.trim();
        const reason = reasonInput.value.trim();

        if (!fullName || !skills || !reason) {
            output.innerHTML = "Please fill in all fields before generating your application.";
            return;
        }

        const applicationText = `
Dear Hiring Manager,

My name is ${fullName}, and I am excited to apply for this entry-level remote tech position.

I have experience working with ${skills}, and I am continuously improving my technical abilities through hands-on practice and self-learning.

${reason}

I am highly motivated, dependable, and eager to contribute to your team while growing professionally in a remote environment.

Thank you for considering my application. I look forward to the opportunity to contribute and learn.

Sincerely,
${fullName}
        `;

        output.innerHTML = applicationText.replace(/\n/g, "<br>");

    });

});
